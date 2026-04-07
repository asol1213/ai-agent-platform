import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock fs module before importing route handlers
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

import { GET, POST } from "../app/api/knowledge/route";
import {
  GET as GET_BY_ID,
  DELETE,
  PATCH,
} from "../app/api/knowledge/[id]/route";

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
  return new Request("http://localhost/api/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/knowledge", () => {
  it("returns empty list initially", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.knowledgeBases).toEqual([]);
  });

  it("returns created knowledge bases", async () => {
    await POST(makeRequest({ name: "Test KB", content: "Test content" }));
    await POST(makeRequest({ name: "Another KB", content: "More content" }));

    const res = await GET();
    const data = await res.json();
    expect(data.knowledgeBases).toHaveLength(2);
  });

  it("list does not include content or chatHistory fields", async () => {
    await POST(makeRequest({ name: "Test KB", content: "Test content" }));

    const res = await GET();
    const data = await res.json();
    expect(data.knowledgeBases[0]).not.toHaveProperty("content");
    expect(data.knowledgeBases[0]).not.toHaveProperty("chatHistory");
    expect(data.knowledgeBases[0]).toHaveProperty("id");
    expect(data.knowledgeBases[0]).toHaveProperty("name");
    expect(data.knowledgeBases[0]).toHaveProperty("createdAt");
  });
});

describe("POST /api/knowledge", () => {
  it("creates a knowledge base successfully", async () => {
    const res = await POST(makeRequest({ name: "My KB", content: "Some content" }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.knowledgeBase.name).toBe("My KB");
    expect(data.knowledgeBase.content).toBe("Some content");
    expect(data.knowledgeBase.id).toBeTruthy();
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ content: "Some content" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  it("returns 400 when content is missing", async () => {
    const res = await POST(makeRequest({ name: "My KB" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("required");
  });

  it("returns 400 when both name and content are missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("generates a slug-based ID", async () => {
    const res = await POST(makeRequest({ name: "Hello World Test", content: "content" }));
    const data = await res.json();
    expect(data.knowledgeBase.id).toMatch(/^hello-world-test-/);
  });

  it("returns 400 when name exceeds 200 characters", async () => {
    const longName = "a".repeat(201);
    const res = await POST(makeRequest({ name: longName, content: "content" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("200");
  });
});

describe("GET /api/knowledge/[id]", () => {
  it("returns full KB with content and chatHistory", async () => {
    const createRes = await POST(makeRequest({ name: "Detail KB", content: "Detailed content" }));
    const created = await createRes.json();
    const id = created.knowledgeBase.id;

    const req = new Request(`http://localhost/api/knowledge/${id}`);
    const res = await GET_BY_ID(req, makeParams(id));
    const data = await res.json();

    expect(data.knowledgeBase.id).toBe(id);
    expect(data.knowledgeBase.name).toBe("Detail KB");
    expect(data.knowledgeBase.content).toBe("Detailed content");
    expect(data.knowledgeBase.chatHistory).toEqual([]);
  });

  it("returns 404 for missing KB", async () => {
    const req = new Request("http://localhost/api/knowledge/nonexistent");
    const res = await GET_BY_ID(req, makeParams("nonexistent"));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });
});

describe("DELETE /api/knowledge/[id]", () => {
  it("deletes an existing KB", async () => {
    const createRes = await POST(makeRequest({ name: "To Delete", content: "content" }));
    const created = await createRes.json();
    const id = created.knowledgeBase.id;

    const req = new Request(`http://localhost/api/knowledge/${id}`, { method: "DELETE" });
    const res = await DELETE(req, makeParams(id));
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify it's gone
    const getRes = await GET_BY_ID(
      new Request(`http://localhost/api/knowledge/${id}`),
      makeParams(id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for missing KB", async () => {
    const req = new Request("http://localhost/api/knowledge/nonexistent", { method: "DELETE" });
    const res = await DELETE(req, makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/knowledge/[id]", () => {
  it("clears chat history", async () => {
    const createRes = await POST(makeRequest({ name: "Chat KB", content: "content" }));
    const created = await createRes.json();
    const id = created.knowledgeBase.id;

    const req = new Request(`http://localhost/api/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clearChat" }),
    });
    const res = await PATCH(req, makeParams(id));
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 404 when clearing chat on missing KB", async () => {
    const req = new Request("http://localhost/api/knowledge/nonexistent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clearChat" }),
    });
    const res = await PATCH(req, makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for unknown action", async () => {
    const createRes = await POST(makeRequest({ name: "KB", content: "content" }));
    const created = await createRes.json();
    const id = created.knowledgeBase.id;

    const req = new Request(`http://localhost/api/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unknownAction" }),
    });
    const res = await PATCH(req, makeParams(id));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Unknown action");
  });
});
