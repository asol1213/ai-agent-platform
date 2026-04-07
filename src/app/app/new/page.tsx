"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
type PDFjsLib = typeof import("pdfjs-dist");

async function getPdfjs(): Promise<PDFjsLib> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjsLib;
}

export default function NewKnowledgeBasePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds maximum size of 10MB.");
      return;
    }

    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "txt") {
      setError("Unsupported file type. Please upload a .pdf or .txt file.");
      return;
    }

    setError("");
    setUploadStatus(`Parsing ${file.name}...`);

    try {
      let text = "";

      if (ext === "txt") {
        text = await file.text();
      } else {
        const pdfjsLib = await getPdfjs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const pageTexts: string[] = [];

        for (let i = 1; i <= totalPages; i++) {
          setUploadStatus(`Parsing page ${i}/${totalPages}...`);
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
          pageTexts.push(pageText);
        }

        text = pageTexts.join("\n\n");
      }

      setContent(text);
      setUploadStatus(`Extracted text from ${file.name}`);

      // Auto-fill name from filename if empty
      if (!name.trim()) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        setName(baseName);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
      setUploadStatus("");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a name for your knowledge base.");
      return;
    }
    if (!content.trim()) {
      setError("Please paste some content for your knowledge base.");
      return;
    }
    if (content.trim().length < 50) {
      setError("Content should be at least 50 characters for meaningful results.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content: content.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create knowledge base");
      }

      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="h-14 border-b border-border-subtle flex items-center px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <span className="font-semibold text-text-primary text-sm">AgentPlatform</span>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            Create Knowledge Base
          </h1>
          <p className="text-text-secondary">
            Give your knowledge base a name and paste the content or upload a file.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-text-primary mb-2"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Company Handbook, Product Docs, FAQ..."
              className="w-full bg-bg-tertiary border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              maxLength={200}
            />
          </div>

          {/* File Upload Area */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Upload File
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-accent bg-accent-muted"
                  : "border-border-default hover:border-accent hover:bg-bg-tertiary"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileInput}
                className="hidden"
              />
              <svg
                className="w-8 h-8 mx-auto mb-3 text-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm text-text-secondary mb-1">
                Drag & drop a file here, or click to browse
              </p>
              <p className="text-xs text-text-muted">
                Supports .pdf and .txt files (max 10MB)
              </p>
            </div>
            {uploadStatus && (
              <p className="mt-2 text-xs text-success">{uploadStatus}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-text-primary mb-2"
            >
              Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your document text here, or upload a file above. The more detailed the content, the better the AI agent can answer questions about it..."
              rows={16}
              className="w-full bg-bg-tertiary border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-y"
            />
            <p className="mt-2 text-xs text-text-muted">
              {content.length.toLocaleString()} characters
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
            >
              {loading ? "Creating..." : "Create Knowledge Base"}
            </button>
            <Link
              href="/app"
              className="px-6 py-3 text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
