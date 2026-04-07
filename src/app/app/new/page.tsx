"use client";

import { useState, useRef } from "react";
import Link from "next/link";

interface Source {
  name: string;
  type: "pdf" | "txt" | "url" | "text";
  chars: number;
}

export default function NewKnowledgeBasePage() {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [parseStatus, setParseStatus] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function parseFile(file: File, index: number, total: number): Promise<{ text: string; name: string; type: "pdf" | "txt" } | null> {
    if (file.size > 10 * 1024 * 1024) {
      setError(`File "${file.name}" exceeds maximum size of 10MB.`);
      return null;
    }

    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "txt") {
      setError(`Unsupported file type for "${file.name}". Please upload .pdf or .txt files.`);
      return null;
    }

    setParseStatus(`Parsing file ${index + 1}/${total}: ${file.name}...`);

    try {
      let text = "";

      if (ext === "txt") {
        text = await file.text();
      } else {
        const pdfjsModule = await import("pdfjs-dist");
        const pdfjsLib = pdfjsModule.default || pdfjsModule;
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: uint8 });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        const pageTexts: string[] = [];

        for (let i = 1; i <= totalPages; i++) {
          setParseStatus(`Parsing file ${index + 1}/${total}: ${file.name} (page ${i}/${totalPages})...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: Record<string, unknown>) => (item.str as string) || "")
            .join(" ");
          pageTexts.push(pageText);
        }

        text = pageTexts.join("\n\n");
      }

      return { text, name: file.name, type: ext as "pdf" | "txt" };
    } catch (err) {
      console.error(`Parse error for ${file.name}:`, err);
      setError(`Failed to parse "${file.name}": ${err instanceof Error ? err.message : "Unknown error"}.`);
      return null;
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setError("");
    const newTexts: string[] = [];
    const newSources: Source[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const result = await parseFile(fileArray[i], i, fileArray.length);
      if (result) {
        newTexts.push(`\n\n--- ${result.name} ---\n\n${result.text}`);
        newSources.push({ name: result.name, type: result.type, chars: result.text.length });
      }
    }

    if (newTexts.length > 0) {
      setContent((prev) => prev + newTexts.join(""));
      setSources((prev) => [...prev, ...newSources]);
      setParseStatus(`Parsed ${newTexts.length} file${newTexts.length > 1 ? "s" : ""} successfully.`);

      if (!name.trim() && fileArray.length === 1) {
        setName(fileArray[0].name.replace(/\.[^.]+$/, ""));
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
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
    const files = e.target.files;
    if (files && files.length > 0) handleFiles(files);
    e.target.value = "";
  }

  async function handleFetchUrl() {
    const url = urlInput.trim();
    if (!url) return;

    setError("");
    setFetchingUrl(true);
    setParseStatus(`Fetching ${url}...`);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to fetch URL");
        setParseStatus("");
        setFetchingUrl(false);
        return;
      }

      const text = data.text as string;
      const title = data.title as string;

      setContent((prev) => prev + `\n\n--- ${url} ---\n\n${text}`);
      setSources((prev) => [...prev, { name: title || url, type: "url", chars: text.length }]);
      setParseStatus(`Fetched "${title}" successfully.`);
      setUrlInput("");
    } catch (err) {
      setError(`Failed to fetch URL: ${err instanceof Error ? err.message : "Network error"}`);
      setParseStatus("");
    } finally {
      setFetchingUrl(false);
    }
  }

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newContent = e.target.value;
    setContent(newContent);

    // Update or add "Manual input" source tracking
    const hasManualSource = sources.some((s) => s.type === "text");
    const otherSourcesChars = sources
      .filter((s) => s.type !== "text")
      .reduce((sum, s) => sum + s.chars, 0);
    const manualChars = Math.max(0, newContent.length - otherSourcesChars);

    if (manualChars > 0 && !hasManualSource) {
      setSources((prev) => [...prev, { name: "Manual input", type: "text", chars: manualChars }]);
    } else if (hasManualSource) {
      setSources((prev) =>
        prev.map((s) => (s.type === "text" ? { ...s, chars: manualChars } : s))
          .filter((s) => s.type !== "text" || s.chars > 0)
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedContent = content.trim();

    if (!trimmedName) {
      setError("Please enter a name for your knowledge base.");
      return;
    }
    if (!trimmedContent) {
      setError("Please paste some content for your knowledge base.");
      return;
    }
    if (trimmedContent.length < 50) {
      setError("Content should be at least 50 characters for meaningful results.");
      return;
    }

    setLoading(true);
    setError("");

    // Build final sources list
    const finalSources = sources.length > 0 ? sources : [{ name: "Manual input", type: "text" as const, chars: trimmedContent.length }];

    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName, content: trimmedContent, sources: finalSources }),
    }).catch((err) => {
      setError("Network error: " + (err instanceof Error ? err.message : "Failed to connect"));
      setLoading(false);
      return null;
    });

    if (!res) return;

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      setError(data.error || "Failed to create knowledge base");
      setLoading(false);
      return;
    }

    window.location.href = "/app";
  }

  const sourceTypeIcon = (type: string) => {
    switch (type) {
      case "pdf": return "PDF";
      case "txt": return "TXT";
      case "url": return "URL";
      default: return "Text";
    }
  };

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
            Give your knowledge base a name and add content from files, URLs, or paste text directly.
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

          {/* Sources list */}
          {sources.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Sources ({sources.length})
              </label>
              <div className="bg-bg-tertiary border border-border-default rounded-xl p-3 space-y-1.5">
                {sources.map((source, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="text-success">&#10003;</span>
                    <span className="text-text-primary truncate flex-1">{source.name}</span>
                    <span className="text-xs text-text-muted px-1.5 py-0.5 rounded bg-bg-hover">
                      {sourceTypeIcon(source.type)}
                    </span>
                    <span className="text-xs text-text-muted">
                      {source.chars.toLocaleString()} chars
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* URL Input */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Add URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/page"
                className="flex-1 bg-bg-tertiary border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleFetchUrl(); } }}
              />
              <button
                type="button"
                onClick={handleFetchUrl}
                disabled={fetchingUrl || !urlInput.trim()}
                className="px-5 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors text-sm shrink-0"
              >
                {fetchingUrl ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching...
                  </span>
                ) : (
                  "Fetch"
                )}
              </button>
            </div>
          </div>

          {/* File Upload Area */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Upload Files
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
                multiple
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
                Drag & drop files here, or click to browse
              </p>
              <p className="text-xs text-text-muted">
                Supports multiple .pdf and .txt files (max 10MB each)
              </p>
            </div>
            {parseStatus && (
              <p className="mt-2 text-xs text-success">{parseStatus}</p>
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
              onChange={handleContentChange}
              placeholder="Paste your document text here, or add content via files/URLs above. The more detailed the content, the better the AI agent can answer questions about it..."
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
