import { getAllKnowledgeBases, createKnowledgeBase, KnowledgeBaseSource } from "@/lib/store";

export async function GET() {
  const knowledgeBases = getAllKnowledgeBases();
  return Response.json({ knowledgeBases });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, content, sources } = body as {
    name?: string;
    content?: string;
    sources?: KnowledgeBaseSource[];
  };

  if (!name || !content) {
    return Response.json(
      { error: "Name and content are required" },
      { status: 400 }
    );
  }

  if (name.length > 200) {
    return Response.json(
      { error: "Name must be 200 characters or less" },
      { status: 400 }
    );
  }

  const kb = createKnowledgeBase(name, content, sources);
  return Response.json({ knowledgeBase: kb }, { status: 201 });
}
