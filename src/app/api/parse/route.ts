import { PDFParse } from "pdf-parse";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "File exceeds maximum size of 10MB" },
      { status: 400 }
    );
  }

  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".txt")) {
    const text = await file.text();
    return Response.json({ text });
  }

  if (fileName.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const text = await parser.getText();
    parser.destroy();
    return Response.json({ text });
  }

  return Response.json(
    { error: "Unsupported file type. Please upload a .pdf or .txt file." },
    { status: 400 }
  );
}
