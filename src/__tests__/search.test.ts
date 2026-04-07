import { describe, it, expect } from "vitest";
import { findRelevantChunks } from "../lib/store";

describe("Search: keyword matching", () => {
  const content = `
Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data. These systems improve their performance on a specific task over time without being explicitly programmed.

Deep learning is a subset of machine learning that uses neural networks with many layers. These deep neural networks are particularly good at processing unstructured data like images, text, and audio.

Natural language processing (NLP) is a field of artificial intelligence that gives machines the ability to read, understand, and derive meaning from human languages. NLP combines computational linguistics with statistical and machine learning models.

Computer vision is a field of artificial intelligence that trains computers to interpret and understand the visual world. Using digital images and deep learning models, machines can accurately identify and classify objects.
`.trim();

  it("matches exact keywords", () => {
    const results = findRelevantChunks(content, "deep learning neural networks");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("deep learning");
    expect(results[0].toLowerCase()).toContain("neural networks");
  });

  it("matches partial/substring keywords", () => {
    const results = findRelevantChunks(content, "neural");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("neural");
  });

  it("is case insensitive", () => {
    const upper = findRelevantChunks(content, "MACHINE LEARNING");
    const lower = findRelevantChunks(content, "machine learning");
    expect(upper.length).toBe(lower.length);
    expect(upper[0]).toBe(lower[0]);
  });

  it("handles multi-word compound terms", () => {
    const results = findRelevantChunks(content, "computer vision");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("computer vision");
  });
});

describe("Search: sentence splitting", () => {
  it("splits into sentences when no paragraph breaks exist", () => {
    const singleParagraph =
      "Python is a versatile programming language. It is widely used in data science and web development. " +
      "JavaScript runs in the browser and on the server. It powers most modern web applications. " +
      "Rust is a systems programming language focused on safety and performance. It prevents memory-related bugs at compile time.";

    const results = findRelevantChunks(singleParagraph, "Python data science");
    expect(results.length).toBeGreaterThan(0);
    // Should find the Python-related sentence(s)
    const combined = results.join(" ").toLowerCase();
    expect(combined).toContain("python");
  });

  it("handles content that is one short sentence", () => {
    const short = "TypeScript adds static types to JavaScript.";
    const results = findRelevantChunks(short, "TypeScript");
    // Short content below threshold, whole content returned
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

describe("Search: stop word removal", () => {
  it("filters out common stop words from queries", () => {
    const content = `
Kubernetes orchestrates containerized applications across clusters of machines. It automates deployment, scaling, and management of applications.

Terraform is an infrastructure as code tool. It lets you define cloud resources in configuration files that can be versioned and shared.
`.trim();

    // "what is the" are all stop words; only "kubernetes" should match
    const results = findRelevantChunks(content, "what is the kubernetes");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].toLowerCase()).toContain("kubernetes");
  });

  it("returns empty when query is entirely stop words", () => {
    const content = "Some meaningful content here about technology and programming.";
    const results = findRelevantChunks(content, "the a an is are");
    expect(results).toEqual([]);
  });

  it("handles single character words after cleaning", () => {
    const content = "React is a library for building user interfaces with reusable components and efficient rendering.";
    // "a" and "I" are short/stop words
    const results = findRelevantChunks(content, "a I");
    expect(results).toEqual([]);
  });
});

describe("Search: edge cases", () => {
  it("returns empty array for empty content", () => {
    const results = findRelevantChunks("", "test query");
    expect(results).toEqual([]);
  });

  it("returns empty array for whitespace-only content", () => {
    const results = findRelevantChunks("   \n\n   ", "test query");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty query", () => {
    const results = findRelevantChunks("Some content here.", "");
    expect(results).toEqual([]);
  });

  it("handles special characters in query", () => {
    const content = "Next.js uses file-based routing. The framework supports API routes and middleware.";
    const results = findRelevantChunks(content, "next.js file-based routing");
    expect(results.length).toBeGreaterThan(0);
  });

  it("handles special characters in content", () => {
    const content = "Use the <script> tag for JavaScript. The & symbol is used for references. Quotes: \"hello\" and 'world'.";
    const results = findRelevantChunks(content, "JavaScript script");
    expect(results.length).toBeGreaterThan(0);
  });

  it("handles very long content with many paragraphs", () => {
    const paragraphs = Array.from(
      { length: 50 },
      (_, i) => `This is paragraph number ${i + 1} about topic ${i + 1}. It contains some detailed information about the subject matter related to area ${i + 1}.`
    ).join("\n\n");

    const results = findRelevantChunks(paragraphs, "paragraph number 25 topic");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toContain("25");
  });

  it("handles no matching content gracefully", () => {
    const content = "This document is about cooking recipes and meal preparation techniques for healthy eating.";
    const results = findRelevantChunks(content, "quantum physics");
    expect(results).toEqual([]);
  });

  it("handles content with only short chunks that get filtered", () => {
    const content = "Hi.\n\nOk.\n\nYes.";
    const results = findRelevantChunks(content, "test");
    expect(results).toEqual([]);
  });

  it("defaults topK to 3", () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) => `Technology paragraph ${i + 1} discusses important technology concepts and their applications in modern technology stacks.`
    ).join("\n\n");

    const results = findRelevantChunks(paragraphs, "technology");
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
