import { getKnowledgeBase, deleteKnowledgeBase, clearChatHistory } from "@/lib/store";

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteKnowledgeBase(id);

  if (!deleted) {
    return Response.json({ error: "Knowledge base not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.action === "clearChat") {
    const cleared = clearChatHistory(id);
    if (!cleared) {
      return Response.json({ error: "Knowledge base not found" }, { status: 404 });
    }
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
