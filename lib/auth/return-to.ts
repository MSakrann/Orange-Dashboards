export const DEFAULT_RETURN_TO = "/hot-topics";

export function safeReturnTo(
  value: string | null | undefined,
  fallback = DEFAULT_RETURN_TO,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const origin = "https://orange-dashboards.local";
    const parsed = new URL(value, origin);
    return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}
