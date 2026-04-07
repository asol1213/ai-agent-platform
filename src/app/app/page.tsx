"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useTheme } from "../theme-provider";

interface KnowledgeBaseSource {
  name: string;
  type: "pdf" | "txt" | "url" | "text";
  chars: number;
}

interface KnowledgeBaseSummary {
  id: string;
  name: string;
  createdAt: string;
  sources: KnowledgeBaseSource[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface KnowledgeBaseFull {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  chatHistory: ChatMessage[];
}

export default function AppPage() {
  const { theme, toggle } = useTheme();
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
  const [selectedKb, setSelectedKb] = useState<KnowledgeBaseFull | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/knowledge")
      .then((res) => res.json())
      .then((data) => setKnowledgeBases(data.knowledgeBases));
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  async function selectKnowledgeBase(id: string) {
    const res = await fetch(`/api/knowledge/${id}`);
    const data = await res.json();
    setSelectedKb(data.knowledgeBase);
    setMessages(data.knowledgeBase.chatHistory);
  }

  async function deleteKnowledgeBase(id: string) {
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    setKnowledgeBases((prev) => prev.filter((kb) => kb.id !== id));
    if (selectedKb?.id === id) {
      setSelectedKb(null);
      setMessages([]);
    }
  }

  async function clearChat() {
    if (!selectedKb) return;
    await fetch(`/api/knowledge/${selectedKb.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clearChat" }),
    });
    setMessages([]);
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedKb || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeBaseId: selectedKb.id,
          message: userMessage,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        // Check if we have the metadata marker
        const metaIndex = fullText.indexOf("\n\n__MSG_META__");
        if (metaIndex === -1) {
          setStreamingContent(fullText);
        } else {
          setStreamingContent(fullText.substring(0, metaIndex));
        }
      }

      // Extract the saved message metadata
      const metaIndex = fullText.indexOf("\n\n__MSG_META__");
      if (metaIndex !== -1) {
        const metaJson = fullText.substring(metaIndex + "\n\n__MSG_META__".length);
        const savedMessage = JSON.parse(metaJson) as ChatMessage;
        setMessages((prev) => [...prev, savedMessage]);
      } else {
        // Fallback: create a local message
        setMessages((prev) => [
          ...prev,
          {
            id: "local-" + Date.now(),
            role: "assistant",
            content: fullText,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: "error-" + Date.now(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setIsStreaming(false);
      setStreamingContent("");
    }
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b border-border-subtle flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <span className="font-semibold text-text-primary text-sm">AgentPlatform</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {selectedKb && (
            <span className="text-sm text-text-secondary truncate max-w-xs">
              {selectedKb.name}
            </span>
          )}
          {selectedKb && (
            <button
              onClick={clearChat}
              className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-md transition-colors"
            >
              Clear Chat
            </button>
          )}
          <button
            onClick={toggle}
            className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary transition-colors text-base"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-72" : "w-0"
          } transition-all duration-200 border-r border-border-subtle bg-bg-secondary flex flex-col overflow-hidden shrink-0`}
        >
          <div className="p-4 border-b border-border-subtle">
            <a
              href="/app/new"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New Knowledge Base
            </a>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="px-3 py-2 text-xs font-medium text-text-muted uppercase tracking-wider">
              Knowledge Bases
            </p>
            {knowledgeBases.length === 0 ? (
              <p className="px-3 py-4 text-sm text-text-muted">
                No knowledge bases yet.
              </p>
            ) : (
              <div className="space-y-1">
                {knowledgeBases.map((kb) => (
                  <div key={kb.id} className="group relative">
                    <button
                      onClick={() => selectKnowledgeBase(kb.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        selectedKb?.id === kb.id
                          ? "bg-accent-muted text-accent"
                          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                      }`}
                    >
                      <div className="font-medium truncate pr-6">{kb.name}</div>
                      {kb.sources && kb.sources.length > 0 && (
                        <div className="text-xs text-text-muted mt-0.5 truncate">
                          {kb.sources.length} source{kb.sources.length > 1 ? "s" : ""}: {kb.sources.map((s) => s.name).join(", ")}
                        </div>
                      )}
                      <div className="text-xs text-text-muted mt-0.5">
                        {new Date(kb.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteKnowledgeBase(kb.id); }}
                      className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-danger/20 text-text-muted hover:text-danger transition-all"
                      aria-label={`Delete ${kb.name}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main chat area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedKb ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-6 space-y-6">
                  {messages.length === 0 && !isStreaming && (
                    <div className="text-center py-20">
                      <div className="w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-text-primary mb-2">
                        Start a conversation
                      </h3>
                      <p className="text-text-secondary text-sm max-w-md mx-auto">
                        Ask any question about &ldquo;{selectedKb.name}&rdquo; and the AI agent will search the knowledge base to find relevant answers.
                      </p>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-accent text-white"
                            : "bg-bg-tertiary text-text-primary"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isStreaming && streamingContent && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-bg-tertiary text-text-primary">
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">
                          {streamingContent}
                          <span className="inline-block w-0.5 h-4 bg-accent ml-0.5 animate-pulse" />
                        </p>
                      </div>
                    </div>
                  )}
                  {loading && !streamingContent && (
                    <div className="flex justify-start">
                      <div className="bg-bg-tertiary rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-text-muted animate-pulse" />
                          <div className="w-2 h-2 rounded-full bg-text-muted animate-pulse [animation-delay:0.2s]" />
                          <div className="w-2 h-2 rounded-full bg-text-muted animate-pulse [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Input */}
              <div className="border-t border-border-subtle p-4">
                <form
                  onSubmit={sendMessage}
                  className="flex gap-3"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a question about the knowledge base..."
                    className="flex-1 bg-bg-tertiary border border-border-default rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="px-4 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  </button>
                </form>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-2xl bg-bg-tertiary flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-text-primary mb-3">
                  Select a knowledge base
                </h2>
                <p className="text-text-secondary text-sm mb-6">
                  Choose a knowledge base from the sidebar to start chatting, or create a new one.
                </p>
                <Link
                  href="/app/new"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Knowledge Base
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
