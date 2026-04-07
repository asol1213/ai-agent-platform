import { getKnowledgeBase } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const kb = getKnowledgeBase(id);

  if (!kb) {
    return Response.json({ error: "Knowledge base not found" }, { status: 404 });
  }

  return Response.json({ knowledgeBase: kb });
}
