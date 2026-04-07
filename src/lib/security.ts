/**
 * Security utilities: rate limiting, input sanitization, content validation.
 */

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, IP-based)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  ip: string,
  maxRequests = RATE_LIMIT_MAX_REQUESTS,
  windowMs = RATE_LIMIT_WINDOW_MS
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitStore.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  entry.count += 1;
  const allowed = entry.count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

/** Periodically clean up expired entries to prevent memory leaks. */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}

// ---------------------------------------------------------------------------
// Input sanitizer (strip HTML tags)
// ---------------------------------------------------------------------------

export function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

// ---------------------------------------------------------------------------
// Content length validator
// ---------------------------------------------------------------------------

const MAX_CONTENT_BYTES = 100 * 1024; // 100 KB

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateContentLength(
  content: string,
  maxBytes = MAX_CONTENT_BYTES
): ValidationResult {
  const byteLength = Buffer.byteLength(content, "utf-8");
  if (byteLength > maxBytes) {
    return {
      valid: false,
      error: `Content exceeds maximum size of ${Math.round(maxBytes / 1024)}KB (received ${Math.round(byteLength / 1024)}KB)`,
    };
  }
  return { valid: true };
}
