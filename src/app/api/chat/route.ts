import { getKnowledgeBase, addChatMessage, findRelevantChunks } from "@/lib/store";
import Groq from "groq-sdk";

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

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

  // Find relevant chunks for context
  const relevantChunks = findRelevantChunks(kb.content, message, 5);
  const context = relevantChunks.length > 0
    ? relevantChunks.join("\n\n")
    : kb.content.slice(0, 2000);

  let responseText: string;

  const systemPrompt = `You are a helpful AI assistant that answers questions based ONLY on the provided knowledge base content.

Rules:
- Answer based on the context provided below
- If the answer is in the context, give a clear, concise answer
- If the answer is NOT in the context, say "I don't have that specific information in the knowledge base" and suggest what topics ARE covered
- Be conversational and helpful
- Support questions in any language (German, English, etc.)
- Keep answers focused and under 200 words
- Format your responses using Markdown: use **bold** for emphasis, bullet lists for multiple items, and \`code\` for technical terms
- Use headers (##) to organize longer responses

Knowledge Base: "${kb.name}"

Context from the knowledge base:
${context}`;

  const messages = [{ role: "system" as const, content: systemPrompt }, { role: "user" as const, content: message }];

  // Try providers: Groq → Cerebras → OpenRouter → keyword fallback

  // 1. Groq
  if (groq) {
    try {
      const res = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages, temperature: 0.3, max_tokens: 500 });
      responseText = res.choices[0]?.message?.content || "";
    } catch (e) { console.log("Groq failed:", (e as Error).message?.slice(0, 80)); }
  }

  // 2. Cerebras
  if (!responseText && process.env.CEREBRAS_API_KEY) {
    try {
      const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}` },
        body: JSON.stringify({ model: "llama3.1-8b", messages, temperature: 0.3, max_tokens: 500 }),
      });
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || "";
    } catch (e) { console.log("Cerebras failed:", (e as Error).message?.slice(0, 80)); }
  }

  // 3. OpenRouter
  if (!responseText && process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model: "google/gemma-3-27b-it:free", messages, temperature: 0.3, max_tokens: 500 }),
      });
      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || "";
    } catch (e) { console.log("OpenRouter failed:", (e as Error).message?.slice(0, 80)); }
  }

  // 4. Keyword fallback
  if (!responseText) {
    responseText = fallbackResponse(relevantChunks, kb.content, message);
  }

  // Save assistant message
  const assistantMessage = addChatMessage(knowledgeBaseId, "assistant", responseText);

  // Stream the response word by word
  const words = responseText.split(/(\s+)/);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (const word of words) {
        controller.enqueue(encoder.encode(word));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
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

function fallbackResponse(chunks: string[], fullContent: string, query: string): string {
  if (chunks.length === 0) {
    const preview = fullContent.slice(0, 500) + (fullContent.length > 500 ? "..." : "");
    return `Here's an overview of the knowledge base content:\n\n${preview}`;
  }
  const intro = getResponseIntro(query);
  return `${intro}\n\n${chunks.map((c) => c.trim()).join("\n\n")}`;
}

function getResponseIntro(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("how many") || q.includes("how much")) return "Here's what I found regarding your question:";
  if (q.includes("what is") || q.includes("what are")) return "Based on the knowledge base:";
  if (q.includes("how does") || q.includes("how to")) return "Here's the relevant information:";
  return "Here's what I found:";
}
