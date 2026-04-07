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

import { POST as createKBRoute, GET as listKBRoute } from "../app/api/knowledge/route";
import {
  GET as getKBRoute,
  DELETE as deleteKBRoute,
  PATCH as patchKBRoute,
} from "../app/api/knowledge/[id]/route";
import { POST as chatRoute } from "../app/api/chat/route";
import { _resetCache } from "../lib/store";

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

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("Integration: full create -> chat -> history -> clear flow", () => {
  it("complete lifecycle", async () => {
    // 1. Create a knowledge base
    const createRes = await createKBRoute(
      jsonRequest("http://localhost/api/knowledge", "POST", {
        name: "Integration Test KB",
        content:
          "Svelte is a compiler that generates minimal JavaScript at build time. Unlike React or Vue, Svelte shifts work from the browser to the build step, resulting in faster runtime performance.\n\nSvelte uses reactive declarations with the $: syntax. When a variable changes, Svelte automatically updates the DOM without a virtual DOM diffing step.",
      })
    );
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    const kbId = createData.knowledgeBase.id;

    // 2. Verify it appears in the list
    const listRes = await listKBRoute();
    const listData = await listRes.json();
    expect(listData.knowledgeBases).toHaveLength(1);
    expect(listData.knowledgeBases[0].name).toBe("Integration Test KB");

    // 3. Chat with it
    const chatRes = await chatRoute(
      jsonRequest("http://localhost/api/chat", "POST", {
        knowledgeBaseId: kbId,
        message: "What is Svelte?",
      })
    );
    expect(chatRes.headers.get("Content-Type")).toBe("text/event-stream");

    // 4. Verify chat history was saved
    const getRes = await getKBRoute(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    const getData = await getRes.json();
    expect(getData.knowledgeBase.chatHistory.length).toBeGreaterThanOrEqual(2);
    expect(getData.knowledgeBase.chatHistory[0].role).toBe("user");
    expect(getData.knowledgeBase.chatHistory[0].content).toBe("What is Svelte?");
    expect(getData.knowledgeBase.chatHistory[1].role).toBe("assistant");

    // 5. Clear chat history
    const clearRes = await patchKBRoute(
      jsonRequest(`http://localhost/api/knowledge/${kbId}`, "PATCH", {
        action: "clearChat",
      }),
      makeParams(kbId)
    );
    const clearData = await clearRes.json();
    expect(clearData.success).toBe(true);

    // 6. Verify chat history is empty
    const getRes2 = await getKBRoute(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    const getData2 = await getRes2.json();
    expect(getData2.knowledgeBase.chatHistory).toEqual([]);

    // 7. KB content still exists
    expect(getData2.knowledgeBase.content).toContain("Svelte");
  });
});

describe("Integration: create -> delete -> verify gone", () => {
  it("delete flow", async () => {
    // Create
    const createRes = await createKBRoute(
      jsonRequest("http://localhost/api/knowledge", "POST", {
        name: "Temporary KB",
        content: "This will be deleted.",
      })
    );
    const createData = await createRes.json();
    const kbId = createData.knowledgeBase.id;

    // Verify exists
    const getRes = await getKBRoute(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    expect(getRes.status).toBe(200);

    // Delete
    const deleteRes = await deleteKBRoute(
      new Request(`http://localhost/api/knowledge/${kbId}`, { method: "DELETE" }),
      makeParams(kbId)
    );
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);

    // Verify gone
    const getRes2 = await getKBRoute(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    expect(getRes2.status).toBe(404);

    // Verify list is empty
    const listRes = await listKBRoute();
    const listData = await listRes.json();
    expect(listData.knowledgeBases).toEqual([]);
  });
});

describe("Integration: search quality through chat", () => {
  it("chat response contains relevant text from KB", async () => {
    const content = `
Docker containers package applications with their dependencies into standardized units. Each container runs in isolation and shares the host OS kernel, making them lightweight compared to virtual machines.

Kubernetes is a container orchestration platform that automates deployment, scaling, and management. It groups containers into pods and manages them across a cluster of machines.

Terraform is an infrastructure as code tool by HashiCorp. It lets you define and provision infrastructure using declarative configuration files written in HCL.
`.trim();

    const createRes = await createKBRoute(
      jsonRequest("http://localhost/api/knowledge", "POST", {
        name: "DevOps KB",
        content,
      })
    );
    const createData = await createRes.json();
    const kbId = createData.knowledgeBase.id;

    // Ask about Docker specifically
    await chatRoute(
      jsonRequest("http://localhost/api/chat", "POST", {
        knowledgeBaseId: kbId,
        message: "Docker containers",
      })
    );

    // Check the assistant response references Docker
    const getRes = await getKBRoute(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    const getData = await getRes.json();
    const assistantMsg = getData.knowledgeBase.chatHistory.find(
      (m: { role: string }) => m.role === "assistant"
    );
    expect(assistantMsg.content.toLowerCase()).toContain("docker");
    expect(assistantMsg.content.toLowerCase()).toContain("container");
  });

  it("multiple chats accumulate in history", async () => {
    const createRes = await createKBRoute(
      jsonRequest("http://localhost/api/knowledge", "POST", {
        name: "Multi Chat KB",
        content:
          "React uses a virtual DOM for efficient updates. Components re-render when state changes.\n\nVue uses a reactivity system based on proxies. It automatically tracks dependencies.",
      })
    );
    const createData = await createRes.json();
    const kbId = createData.knowledgeBase.id;

    // First chat
    await chatRoute(
      jsonRequest("http://localhost/api/chat", "POST", {
        knowledgeBaseId: kbId,
        message: "React virtual DOM",
      })
    );

    // Second chat
    await chatRoute(
      jsonRequest("http://localhost/api/chat", "POST", {
        knowledgeBaseId: kbId,
        message: "Vue reactivity",
      })
    );

    const getRes = await getKBRoute(
      new Request(`http://localhost/api/knowledge/${kbId}`),
      makeParams(kbId)
    );
    const getData = await getRes.json();
    // 2 user messages + 2 assistant messages = 4
    expect(getData.knowledgeBase.chatHistory).toHaveLength(4);
  });
});
