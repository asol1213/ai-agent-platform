import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { POST as createKB } from "../app/api/knowledge/route";
import { POST as chatPost } from "../app/api/chat/route";
import { GET as getKB } from "../app/api/knowledge/[id]/route";

// Reset store before each test
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

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeKBRequest(body: unknown): Request {
  return new Request("http://localhost/api/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createTestKB(name: string, content: string): Promise<string> {
  const res = await createKB(makeKBRequest({ name, content }));
  const data = await res.json();
  return data.knowledgeBase.id;
}

describe("POST /api/chat", () => {
  it("returns a streaming response for valid request", async () => {
    const kbId = await createTestKB(
      "Chat Test",
      "Next.js is a React framework for production. It provides hybrid static and server rendering, TypeScript support, smart bundling, and more."
    );

    const res = await chatPost(makeRequest({ knowledgeBaseId: kbId, message: "What is Next.js?" }));
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("returns 404 for missing knowledge base", async () => {
    const res = await chatPost(
      makeRequest({ knowledgeBaseId: "nonexistent", message: "Hello" })
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  it("returns 400 when knowledgeBaseId is missing", async () => {
    const res = await chatPost(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  it("returns 400 when message is missing", async () => {
    const kbId = await createTestKB("Empty Msg Test", "Some content here for testing.");
    const res = await chatPost(makeRequest({ knowledgeBaseId: kbId }));
    expect(res.status).toBe(400);
  });

  it("saves user and assistant messages to chat history", async () => {
    const content =
      "PostgreSQL is an advanced relational database. It supports JSON, full-text search, and complex queries with excellent performance.";
    const kbId = await createTestKB("History Test", content);

    const res = await chatPost(
      makeRequest({ knowledgeBaseId: kbId, message: "Tell me about PostgreSQL" })
    );
    // Consume the stream to ensure messages are saved
    expect(res.body).not.toBeNull();

    // Check chat history was saved
    const kbRes = await getKB(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    const kbData = await kbRes.json();
    expect(kbData.knowledgeBase.chatHistory.length).toBeGreaterThanOrEqual(2);
    expect(kbData.knowledgeBase.chatHistory[0].role).toBe("user");
    expect(kbData.knowledgeBase.chatHistory[0].content).toBe("Tell me about PostgreSQL");
    expect(kbData.knowledgeBase.chatHistory[1].role).toBe("assistant");
  });

  it("response contains relevant content from KB when query matches", async () => {
    const content =
      "Kubernetes orchestrates containerized applications across clusters. It automates deployment, scaling, and management of containerized applications.";
    const kbId = await createTestKB("K8s KB", content);

    const res = await chatPost(
      makeRequest({ knowledgeBaseId: kbId, message: "Kubernetes containers" })
    );
    expect(res.body).not.toBeNull();

    // Check the assistant message contains relevant info
    const kbRes = await getKB(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    const kbData = await kbRes.json();
    const assistantMsg = kbData.knowledgeBase.chatHistory.find(
      (m: { role: string }) => m.role === "assistant"
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content.toLowerCase()).toContain("kubernetes");
  });

  it("returns fallback message when query has no matching content", async () => {
    const content =
      "This knowledge base is exclusively about gardening tips and flower arrangement techniques for beginners.";
    const kbId = await createTestKB("Garden KB", content);

    const res = await chatPost(
      makeRequest({ knowledgeBaseId: kbId, message: "quantum physics" })
    );
    expect(res.body).not.toBeNull();

    const kbRes = await getKB(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    const kbData = await kbRes.json();
    const assistantMsg = kbData.knowledgeBase.chatHistory.find(
      (m: { role: string }) => m.role === "assistant"
    );
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content.toLowerCase()).toContain("couldn't find");
  });
});
