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
    responseText =
      "I couldn't find relevant information about that in the knowledge base. Try rephrasing your question or asking about a different topic covered in the documents.";
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

  return Response.json({ message: assistantMessage });
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
