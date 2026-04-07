import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "src", "data", "knowledge.json");

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  chatHistory: ChatMessage[];
}

interface StoreData {
  knowledgeBases: KnowledgeBase[];
}

function readStore(): StoreData {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { knowledgeBases: [] };
  }
}

function writeStore(data: StoreData): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function getAllKnowledgeBases(): Omit<KnowledgeBase, "content" | "chatHistory">[] {
  const data = readStore();
  return data.knowledgeBases.map(({ id, name, createdAt }) => ({
    id,
    name,
    createdAt,
  }));
}

export function getKnowledgeBase(id: string): KnowledgeBase | null {
  const data = readStore();
  return data.knowledgeBases.find((kb) => kb.id === id) ?? null;
}

export function createKnowledgeBase(name: string, content: string): KnowledgeBase {
  const data = readStore();
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) +
    "-" +
    Date.now().toString(36);

  const kb: KnowledgeBase = {
    id,
    name,
    content,
    createdAt: new Date().toISOString(),
    chatHistory: [],
  };

  data.knowledgeBases.push(kb);
  writeStore(data);
  return kb;
}

export function addChatMessage(
  knowledgeBaseId: string,
  role: "user" | "assistant",
  content: string
): ChatMessage | null {
  const data = readStore();
  const kb = data.knowledgeBases.find((k) => k.id === knowledgeBaseId);
  if (!kb) return null;

  const message: ChatMessage = {
    id: "msg-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    role,
    content,
    timestamp: new Date().toISOString(),
  };

  kb.chatHistory.push(message);
  writeStore(data);
  return message;
}

/**
 * Smart keyword matching: finds the most relevant paragraphs from the knowledge base
 * based on keyword overlap with the user's question.
 */
export function findRelevantChunks(content: string, query: string, topK = 3): string[] {
  // Split content into chunks: try paragraphs first, then sentences
  let chunks = content
    .split(/\n\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 20);

  // If we got 0-1 chunks, split by sentences instead
  if (chunks.length <= 1) {
    chunks = content
      .split(/(?<=[.!?])\s+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 10);
  }

  // If still nothing, use the whole content as one chunk
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks = [content.trim()];
  }

  // Extract keywords from query (remove stop words, lowercase)
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "don", "now", "and", "but", "or", "if", "while", "that", "this",
    "what", "which", "who", "whom", "it", "its", "i", "me", "my", "we",
    "our", "you", "your", "he", "she", "they", "them", "their", "about",
    "tell", "describe", "explain", "many", "much", "does", "what's",
  ]);

  const queryWords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));

  if (queryWords.length === 0) return [];

  // Score each chunk by keyword overlap
  const scored = chunks.map((chunk) => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;

    for (const word of queryWords) {
      // Exact word match (higher weight)
      const wordRegex = new RegExp(`\\b${word}\\b`, "gi");
      const matches = chunkLower.match(wordRegex);
      if (matches) {
        score += matches.length * 2;
      }

      // Partial/substring match (lower weight)
      if (chunkLower.includes(word)) {
        score += 1;
      }
    }

    // Boost score for chunks that contain multiple different query words
    const uniqueMatches = queryWords.filter((w) => chunkLower.includes(w));
    score += uniqueMatches.length * 3;

    return { chunk, score };
  });

  // Sort by score descending, take top K
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}
