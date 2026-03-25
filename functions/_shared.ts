// Shared helper for all Pages Functions
export function getApiKey(): string | null {
  // Try env variable (set in Cloudflare Pages settings)
  return process.env.REMOVE_BG_API_KEY ?? null;
}
