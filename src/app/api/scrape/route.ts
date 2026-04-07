import * as cheerio from "cheerio";

const MAX_CONTENT_CHARS = 50_000;
const FETCH_TIMEOUT_MS = 10_000;

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!parsedUrl.protocol.startsWith("http")) {
      return Response.json({ error: "URL must use http or https protocol" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid URL format" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentPlatform/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json(
        { error: `Failed to fetch URL: HTTP ${res.status}` },
        { status: 422 }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
      return Response.json(
        { error: `Non-HTML response (${contentType})` },
        { status: 422 }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $("script, style, nav, footer, header, noscript, iframe, svg, form, aside").remove();
    $("[role='navigation'], [role='banner'], [role='contentinfo']").remove();

    // Extract title
    const title = $("title").first().text().trim() || $("h1").first().text().trim() || parsedUrl.hostname;

    // Extract main text content
    const mainSelectors = ["main", "article", "[role='main']", ".content", "#content", ".post-content", ".entry-content"];
    let textContent = "";

    for (const selector of mainSelectors) {
      const el = $(selector).first();
      if (el.length) {
        textContent = el.text();
        break;
      }
    }

    // Fallback to body text
    if (!textContent.trim()) {
      textContent = $("body").text();
    }

    // Clean up whitespace
    textContent = textContent
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim()
      .slice(0, MAX_CONTENT_CHARS);

    if (!textContent) {
      return Response.json(
        { error: "Could not extract text content from URL" },
        { status: 422 }
      );
    }

    return Response.json({
      text: textContent,
      title,
      url,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return Response.json({ error: "Request timed out (10s)" }, { status: 408 });
    }
    return Response.json(
      { error: `Failed to scrape URL: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
