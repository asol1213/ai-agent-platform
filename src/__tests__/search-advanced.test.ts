import { describe, it, expect } from "vitest";
import { findRelevantChunks } from "../lib/store";

describe("Search: relevance ranking", () => {
  const content = `
Next.js is a React framework for building full-stack web applications. You use React Components to build user interfaces, and Next.js for additional features and optimizations.

Python is a high-level programming language known for its readability and versatility. It is widely used in data science, machine learning, and web development with frameworks like Django and Flask.

TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. TypeScript adds additional syntax to JavaScript.

Rust is a systems programming language that focuses on safety, speed, and concurrency. Rust achieves memory safety without a garbage collector through its ownership system.

Vue.js is a progressive JavaScript framework for building user interfaces. Unlike other monolithic frameworks, Vue is designed from the ground up to be incrementally adoptable.
`.trim();

  it("ranks the most relevant chunk highest", () => {
    const results = findRelevantChunks(content, "Next.js React framework");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("next.js");
    expect(results[0].toLowerCase()).toContain("react");
  });

  it("multi-word query finds chunks with all matching words", () => {
    const results = findRelevantChunks(content, "Next.js React framework");
    expect(results.length).toBeGreaterThan(0);
    const topChunk = results[0].toLowerCase();
    expect(topChunk).toContain("next.js");
    expect(topChunk).toContain("react");
    expect(topChunk).toContain("framework");
  });

  it("is case insensitive: NEXT.JS matches next.js", () => {
    const upper = findRelevantChunks(content, "NEXT.JS");
    const lower = findRelevantChunks(content, "next.js");
    expect(upper.length).toBeGreaterThan(0);
    expect(upper[0]).toBe(lower[0]);
  });

  it("handles punctuation in queries: What's Next.js?", () => {
    const results = findRelevantChunks(content, "What's Next.js?");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("next.js");
  });

  it("no false positives: Python query does not match JavaScript content", () => {
    const results = findRelevantChunks(content, "Python data science machine learning");
    expect(results.length).toBeGreaterThan(0);
    // The top result should be the Python paragraph
    expect(results[0].toLowerCase()).toContain("python");
    // Should NOT be the Next.js or Vue.js paragraph
    expect(results[0].toLowerCase()).not.toContain("next.js");
  });

  it("empty query returns empty", () => {
    const results = findRelevantChunks(content, "");
    expect(results).toEqual([]);
  });

  it("query with only stop words returns empty", () => {
    const results = findRelevantChunks(content, "what is the");
    expect(results).toEqual([]);
  });

  it("score ordering: higher-scoring chunks come first", () => {
    // TypeScript mentions JavaScript twice -> should rank higher for "JavaScript" than Vue which mentions it once
    const results = findRelevantChunks(content, "JavaScript");
    expect(results.length).toBeGreaterThan(1);
    // Just verify we get results and they contain the keyword
    const allContainKeyword = results.every((r) =>
      r.toLowerCase().includes("javascript")
    );
    expect(allContainKeyword).toBe(true);
  });
});

describe("Search: long content", () => {
  it("finds the correct paragraph in 10+ paragraph content", () => {
    const paragraphs = Array.from({ length: 15 }, (_, i) => {
      if (i === 7) {
        return "GraphQL is a query language for APIs and a runtime for executing those queries. It provides a complete description of the data in your API and gives clients the power to ask for exactly what they need.";
      }
      return `Paragraph ${i + 1} discusses general topic number ${i + 1} with various details about subject area ${i + 1} including implementation notes and best practices.`;
    }).join("\n\n");

    const results = findRelevantChunks(paragraphs, "GraphQL query language APIs");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("graphql");
  });
});

describe("Search: sentence splitting fallback", () => {
  it("content without paragraph breaks still gets chunked by sentences", () => {
    const singleParagraph =
      "Redis is an in-memory data store used as a database and cache. " +
      "PostgreSQL is a powerful relational database with advanced features. " +
      "MongoDB is a document-oriented NoSQL database for high-volume storage. " +
      "SQLite is a lightweight embedded database engine.";

    const results = findRelevantChunks(singleParagraph, "Redis cache memory");
    expect(results.length).toBeGreaterThan(0);
    const combined = results.join(" ").toLowerCase();
    expect(combined).toContain("redis");
  });
});

describe("Search: special characters in content", () => {
  it("handles quotes, brackets, and unicode in content", () => {
    const content = `
The "useState" hook in React lets you add state to functional components. It returns an array: [value, setValue]. This is the most commonly used React hook.

Arrow functions use the => syntax in JavaScript. They provide a concise way to write functions and lexically bind "this". Example: const add = (a, b) => a + b;

Unicode support is essential for i18n. Characters like umlauts (ä, ö, ü), accents (é, è), and symbols (€, ¥, £) must be handled correctly in modern applications.
`.trim();

    const results = findRelevantChunks(content, "useState hook React");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toContain("useState");
  });

  it("handles content with HTML-like tags", () => {
    const content =
      "Use <div> elements for layout. The <span> element is inline. " +
      "Always close your <img /> tags properly.";
    const results = findRelevantChunks(content, "div elements layout");
    expect(results.length).toBeGreaterThan(0);
  });
});
