import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "src", "data", "knowledge.json");

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface KnowledgeBaseSource {
  name: string;
  type: "pdf" | "txt" | "url" | "text";
  chars: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  chatHistory: ChatMessage[];
  sources: KnowledgeBaseSource[];
}

interface StoreData {
  knowledgeBases: KnowledgeBase[];
}

// In-memory cache — survives across requests in the same serverless instance
// Initialized from the JSON file on first read
let memoryStore: StoreData | null = null;

function readStore(): StoreData {
  if (memoryStore) return memoryStore;
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    memoryStore = JSON.parse(raw);
    return memoryStore!;
  } catch {
    memoryStore = { knowledgeBases: [] };
    return memoryStore;
  }
}

function writeStore(data: StoreData): void {
  memoryStore = data;
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Vercel serverless: file writes don't persist, but in-memory cache does
  }
}

export function getAllKnowledgeBases(): Omit<KnowledgeBase, "content" | "chatHistory">[] {
  const data = readStore();
  return data.knowledgeBases.map(({ id, name, createdAt, sources }) => ({
    id,
    name,
    createdAt,
    sources: sources || [{ name: "Manual input", type: "text" as const, chars: 0 }],
  }));
}

export function getKnowledgeBase(id: string): KnowledgeBase | null {
  const data = readStore();
  return data.knowledgeBases.find((kb) => kb.id === id) ?? null;
}

export function createKnowledgeBase(
  name: string,
  content: string,
  sources?: KnowledgeBaseSource[]
): KnowledgeBase {
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
    sources: sources && sources.length > 0
      ? sources
      : [{ name: "Manual input", type: "text" as const, chars: content.length }],
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

export function deleteKnowledgeBase(id: string): boolean {
  const data = readStore();
  const index = data.knowledgeBases.findIndex((kb) => kb.id === id);
  if (index === -1) return false;
  data.knowledgeBases.splice(index, 1);
  writeStore(data);
  return true;
}

export function clearChatHistory(knowledgeBaseId: string): boolean {
  const data = readStore();
  const kb = data.knowledgeBases.find((k) => k.id === knowledgeBaseId);
  if (!kb) return false;
  kb.chatHistory = [];
  writeStore(data);
  return true;
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

  // Stop words (English + German)
  const stopWords = new Set([
    // English
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "to", "of", "in", "for", "on", "with",
    "at", "by", "from", "as", "into", "through", "and", "but", "or", "if",
    "that", "this", "what", "which", "who", "it", "its", "i", "me", "my",
    "we", "our", "you", "your", "he", "she", "they", "them", "their",
    // German
    "der", "die", "das", "ein", "eine", "und", "oder", "aber", "ist", "sind",
    "war", "hat", "haben", "wird", "werden", "kann", "von", "zu", "mit",
    "auf", "für", "aus", "bei", "nach", "über", "unter", "vor", "wie",
    "was", "wer", "wo", "wann", "warum", "ich", "du", "er", "sie", "es",
    "wir", "ihr", "sein", "seine", "seiner", "seinem", "seinen", "ihre",
    "nicht", "auch", "noch", "schon", "nur", "sehr", "mehr", "hier",
    "dann", "wenn", "als", "so", "doch", "mal", "dem", "den", "des",
  ]);

  // Keep unicode chars (for German umlauts etc), remove only punctuation
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}.-]/gu, ""))
    .filter((w) => w.length > 1 && !stopWords.has(w));

  // If ALL words were stop words, use the full query as a single search term
  if (queryWords.length === 0) {
    const fallback = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    if (fallback.length > 2) {
      // Return first chunks as general context
      return chunks.slice(0, topK);
    }
    return [];
  }

  // Score each chunk by keyword overlap
  const scored = chunks.map((chunk) => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;

    for (const word of queryWords) {
      // Substring match
      const occurrences = chunkLower.split(word).length - 1;
      if (occurrences > 0) {
        score += occurrences * 3;
      }
      // Partial match (first 4 chars) — catches word stems
      if (word.length >= 4) {
        const stem = word.slice(0, 4);
        const stemMatches = chunkLower.split(stem).length - 1;
        if (stemMatches > 0) {
          score += stemMatches;
        }
      }
    }

    // Boost for multiple different keyword matches
    const uniqueMatches = queryWords.filter((w) => chunkLower.includes(w));
    score += uniqueMatches.length * 3;

    return { chunk, score };
  });

  const results = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);

  // If no keyword matches found, return first chunks as general context
  // This ensures the user always gets SOMETHING instead of "not found"
  if (results.length === 0 && chunks.length > 0) {
    return chunks.slice(0, Math.min(topK, 2));
  }

  return results;
}

/** Reset in-memory cache — used in tests */
export function _resetCache(): void {
  memoryStore = null;
}
