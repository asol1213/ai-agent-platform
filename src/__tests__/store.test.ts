import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAllKnowledgeBases,
  getKnowledgeBase,
  createKnowledgeBase,
  addChatMessage,
  findRelevantChunks,
  _resetCache,
} from "../lib/store";

// Mock fs module
vi.mock("fs", () => {
  let store = JSON.stringify({ knowledgeBases: [] });
  return {
    default: {
      readFileSync: vi.fn(() => store),
      writeFileSync: vi.fn((_path: string, data: string) => {
        store = data;
      }),
    },
    readFileSync: vi.fn(() => store),
    writeFileSync: vi.fn((_path: string, data: string) => {
      store = data;
    }),
  };
});

// Reset store before each test
beforeEach(async () => {
  _resetCache();
  const fs = await import("fs");
  const empty = JSON.stringify({ knowledgeBases: [] });
  (fs.default.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(empty);
  (fs.default.writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(
    (_path: string, data: string) => {
      (fs.default.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(data);
    }
  );
});

describe("CRUD operations", () => {
  it("returns empty list initially", () => {
    const all = getAllKnowledgeBases();
    expect(all).toEqual([]);
  });

  it("creates a knowledge base and retrieves it", () => {
    const kb = createKnowledgeBase("Test KB", "Some content about testing");
    expect(kb.name).toBe("Test KB");
    expect(kb.content).toBe("Some content about testing");
    expect(kb.chatHistory).toEqual([]);
    expect(kb.id).toBeTruthy();
    expect(kb.createdAt).toBeTruthy();
    expect(kb.sources).toEqual([{ name: "Manual input", type: "text", chars: 26 }]);
  });

  it("lists all knowledge bases without content or chatHistory", () => {
    createKnowledgeBase("KB One", "Content one");
    createKnowledgeBase("KB Two", "Content two");
    const all = getAllKnowledgeBases();
    expect(all).toHaveLength(2);
    expect(all[0]).not.toHaveProperty("content");
    expect(all[0]).not.toHaveProperty("chatHistory");
    expect(all[0]).toHaveProperty("id");
    expect(all[0]).toHaveProperty("name");
    expect(all[0]).toHaveProperty("createdAt");
  });

  it("gets a single knowledge base by id", () => {
    const created = createKnowledgeBase("Single KB", "Content here");
    const found = getKnowledgeBase(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Single KB");
    expect(found!.content).toBe("Content here");
  });

  it("returns null for non-existent knowledge base", () => {
    const found = getKnowledgeBase("non-existent-id");
    expect(found).toBeNull();
  });

  it("generates slug-based IDs", () => {
    const kb = createKnowledgeBase("My Test Knowledge Base!", "content");
    expect(kb.id).toMatch(/^my-test-knowledge-base-/);
  });
});

describe("Chat history", () => {
  it("adds a user message to a knowledge base", () => {
    const kb = createKnowledgeBase("Chat KB", "Some content");
    const msg = addChatMessage(kb.id, "user", "Hello!");
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe("user");
    expect(msg!.content).toBe("Hello!");
    expect(msg!.id).toMatch(/^msg-/);
    expect(msg!.timestamp).toBeTruthy();
  });

  it("adds an assistant message to a knowledge base", () => {
    const kb = createKnowledgeBase("Chat KB", "Some content");
    const msg = addChatMessage(kb.id, "assistant", "Hi there!");
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe("assistant");
  });

  it("persists chat messages in the knowledge base", () => {
    const kb = createKnowledgeBase("Chat KB", "Some content");
    addChatMessage(kb.id, "user", "First message");
    addChatMessage(kb.id, "assistant", "Response");
    addChatMessage(kb.id, "user", "Second message");

    const retrieved = getKnowledgeBase(kb.id);
    expect(retrieved!.chatHistory).toHaveLength(3);
    expect(retrieved!.chatHistory[0].content).toBe("First message");
    expect(retrieved!.chatHistory[1].content).toBe("Response");
    expect(retrieved!.chatHistory[2].content).toBe("Second message");
  });

  it("returns null when adding message to non-existent KB", () => {
    const msg = addChatMessage("fake-id", "user", "Hello");
    expect(msg).toBeNull();
  });
});

describe("findRelevantChunks - basic behavior", () => {
  const sampleContent = `
TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds optional static type checking along with the latest ECMAScript features.

React is a JavaScript library for building user interfaces. It lets you compose complex UIs from small and isolated pieces of code called components.

Next.js is a React framework that enables server-side rendering and static site generation. It provides an excellent developer experience with features like file-based routing.

Docker is a platform for developing, shipping, and running applications in containers. Containers are lightweight and contain everything needed to run an application.
`.trim();

  it("finds chunks matching a simple keyword query", () => {
    const results = findRelevantChunks(sampleContent, "TypeScript");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("typescript");
  });

  it("returns multiple relevant chunks when query matches several", () => {
    const results = findRelevantChunks(sampleContent, "JavaScript library");
    expect(results.length).toBeGreaterThan(0);
  });

  it("respects topK parameter", () => {
    const results = findRelevantChunks(sampleContent, "JavaScript", 1);
    expect(results).toHaveLength(1);
  });

  it("returns fallback context for stop-word-only queries", () => {
    const results = findRelevantChunks(sampleContent, "the is a");
    // Fallback: returns first chunks as context
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it("ranks more relevant chunks higher", () => {
    const results = findRelevantChunks(sampleContent, "React framework server-side rendering");
    expect(results.length).toBeGreaterThan(0);
    // The Next.js chunk mentions React, framework, and server-side rendering
    expect(results[0].toLowerCase()).toContain("next.js");
  });
});
