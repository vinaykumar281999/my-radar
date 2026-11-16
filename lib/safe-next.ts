/**
 * Post-auth redirect target. Only same-origin relative paths are allowed:
 * rejects absolute URLs, protocol-relative "//host", and "/\host" (which
 * browsers normalize to "//host").
 */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
