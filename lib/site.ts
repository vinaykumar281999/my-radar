/** Absolute base URL for share links and metadata. */
export function getSiteUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);
  return (fromEnv ?? "http://localhost:3000").replace(/\/$/, "");
}

/** "radar.app/username" style display string (no protocol). */
export function displayLink(base: string, username: string) {
  return `${base.replace(/^https?:\/\//, "")}/${username}`;
}
