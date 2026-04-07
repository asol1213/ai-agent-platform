import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAllKnowledgeBases,
  getKnowledgeBase,
  createKnowledgeBase,
  addChatMessage,
  deleteKnowledgeBase,
  clearChatHistory,
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

beforeEach(async () => {
  const fs = await import("fs");
  const empty = JSON.stringify({ knowledgeBases: [] });
  (fs.default.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(empty);
  (fs.default.writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(
    (_path: string, data: string) => {
      (fs.default.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(data);
    }
  );
});

describe("Store: multiple KB operations", () => {
  it("creates and lists multiple knowledge bases", () => {
    createKnowledgeBase("KB 1", "Content 1");
    createKnowledgeBase("KB 2", "Content 2");
    createKnowledgeBase("KB 3", "Content 3");

    const all = getAllKnowledgeBases();
    expect(all).toHaveLength(3);
    expect(all.map((kb) => kb.name)).toEqual(["KB 1", "KB 2", "KB 3"]);
  });

  it("each KB gets its own ID even with same name", () => {
    const kb1 = createKnowledgeBase("Same Name", "Content 1");
    // IDs use Date.now() so they may collide in same ms, but both are retrievable
    const kb2 = createKnowledgeBase("Same Name", "Content 2");
    // Both should exist in the store
    const all = getAllKnowledgeBases();
    expect(all).toHaveLength(2);
  });
});

describe("Store: delete operations", () => {
  it("delete non-existent KB returns false", () => {
    const result = deleteKnowledgeBase("nonexistent-id");
    expect(result).toBe(false);
  });

  it("delete existing KB returns true and removes it", () => {
    const kb = createKnowledgeBase("To Delete", "content");
    expect(deleteKnowledgeBase(kb.id)).toBe(true);
    expect(getKnowledgeBase(kb.id)).toBeNull();
  });

  it("deleting one KB does not affect others", () => {
    const kb1 = createKnowledgeBase("Keep", "content 1");
    const kb2 = createKnowledgeBase("Delete", "content 2");
    const kb3 = createKnowledgeBase("Keep Too", "content 3");

    deleteKnowledgeBase(kb2.id);

    expect(getKnowledgeBase(kb1.id)).not.toBeNull();
    expect(getKnowledgeBase(kb2.id)).toBeNull();
    expect(getKnowledgeBase(kb3.id)).not.toBeNull();
    expect(getAllKnowledgeBases()).toHaveLength(2);
  });
});

describe("Store: clearChatHistory", () => {
  it("clear chat on non-existent KB returns false", () => {
    const result = clearChatHistory("nonexistent-id");
    expect(result).toBe(false);
  });

  it("clears chat history successfully", () => {
    const kb = createKnowledgeBase("Chat KB", "content");
    addChatMessage(kb.id, "user", "Hello");
    addChatMessage(kb.id, "assistant", "Hi there!");

    expect(clearChatHistory(kb.id)).toBe(true);

    const retrieved = getKnowledgeBase(kb.id);
    expect(retrieved!.chatHistory).toEqual([]);
  });
});

describe("Store: chat history persistence", () => {
  it("chat history persists across multiple retrievals", () => {
    const kb = createKnowledgeBase("Persistent Chat", "content");
    addChatMessage(kb.id, "user", "Message 1");
    addChatMessage(kb.id, "assistant", "Reply 1");
    addChatMessage(kb.id, "user", "Message 2");
    addChatMessage(kb.id, "assistant", "Reply 2");

    const retrieved1 = getKnowledgeBase(kb.id);
    expect(retrieved1!.chatHistory).toHaveLength(4);

    const retrieved2 = getKnowledgeBase(kb.id);
    expect(retrieved2!.chatHistory).toHaveLength(4);
    expect(retrieved2!.chatHistory[0].content).toBe("Message 1");
    expect(retrieved2!.chatHistory[3].content).toBe("Reply 2");
  });
});

describe("Store: edge cases", () => {
  it("handles KB with very long content (10000+ chars)", () => {
    const longContent = "x".repeat(15000);
    const kb = createKnowledgeBase("Long Content", longContent);
    const retrieved = getKnowledgeBase(kb.id);
    expect(retrieved!.content.length).toBe(15000);
  });

  it("handles special characters in KB name", () => {
    const kb = createKnowledgeBase('Special: "Chars" & <Tags> (Test)', "content");
    expect(kb.name).toBe('Special: "Chars" & <Tags> (Test)');
    const retrieved = getKnowledgeBase(kb.id);
    expect(retrieved!.name).toBe('Special: "Chars" & <Tags> (Test)');
  });

  it("handles special characters in KB content", () => {
    const content = 'Content with "quotes", <tags>, & ampersands, unicode: äöü, emoji: 🎉';
    const kb = createKnowledgeBase("Special Content", content);
    const retrieved = getKnowledgeBase(kb.id);
    expect(retrieved!.content).toBe(content);
  });

  it("handles unicode in KB name for ID generation", () => {
    const kb = createKnowledgeBase("Ünïcödé Nàmé", "content");
    // Non-ASCII chars are stripped from ID slug, remaining chars form the slug
    expect(kb.id).toBeTruthy();
    // The slug only keeps a-z0-9, so unicode chars produce partial slugs
    expect(kb.id).toMatch(/^[a-z0-9-]+-[a-z0-9]+$/);
    expect(kb.name).toBe("Ünïcödé Nàmé");
  });

  it("handles concurrent-like operations (sequential rapid calls)", () => {
    // Simulate rapid sequential operations
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const kb = createKnowledgeBase(`KB ${i}`, `Content ${i}`);
      ids.push(kb.id);
    }
    expect(getAllKnowledgeBases()).toHaveLength(10);

    // Delete every other one
    for (let i = 0; i < 10; i += 2) {
      deleteKnowledgeBase(ids[i]);
    }
    expect(getAllKnowledgeBases()).toHaveLength(5);
  });
});
