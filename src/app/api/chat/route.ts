import { getKnowledgeBase, addChatMessage, findRelevantChunks } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json();
  const { knowledgeBaseId, message } = body;

  if (!knowledgeBaseId || !message) {
    return Response.json(
      { error: "knowledgeBaseId and message are required" },
      { status: 400 }
    );
  }

  const kb = getKnowledgeBase(knowledgeBaseId);
  if (!kb) {
    return Response.json(
      { error: "Knowledge base not found" },
      { status: 404 }
    );
  }

  // Save user message
  addChatMessage(knowledgeBaseId, "user", message);

  // Find relevant chunks
  const relevantChunks = findRelevantChunks(kb.content, message);

  let responseText: string;

  if (relevantChunks.length === 0) {
    // Fallback: show beginning of the document
    const preview = kb.content.slice(0, 500) + (kb.content.length > 500 ? "..." : "");
    responseText = `Here's an overview of the knowledge base content:\n\n${preview}`;
  } else {
    // Format a natural-looking response from the chunks
    const intro = getResponseIntro(message);
    const formattedChunks = relevantChunks
      .map((chunk) => chunk.trim())
      .join("\n\n");
    responseText = `${intro}\n\n${formattedChunks}`;
  }

  // Save assistant message
  const assistantMessage = addChatMessage(knowledgeBaseId, "assistant", responseText);

  // Stream the response word by word
  const words = responseText.split(/(\s+)/); // preserve whitespace tokens
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (const word of words) {
        controller.enqueue(encoder.encode(word));
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      // Send a final event with the saved message metadata
      controller.enqueue(
        encoder.encode(`\n\n__MSG_META__${JSON.stringify(assistantMessage)}`)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function getResponseIntro(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("how many") || q.includes("how much")) {
    return "Here's what I found regarding your question:";
  }
  if (q.includes("what is") || q.includes("what are") || q.includes("what's")) {
    return "Based on the knowledge base, here's the relevant information:";
  }
  if (q.includes("how does") || q.includes("how do") || q.includes("how to")) {
    return "Here's the relevant information about how this works:";
  }
  if (q.includes("why")) {
    return "Here's what the knowledge base says about that:";
  }
  return "Here's what I found in the knowledge base:";
}
