export function safeInternalPath(value: string | null | undefined, fallback = "/chama") {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const target = new URL(value, "https://chamapulse.invalid");
    if (target.origin !== "https://chamapulse.invalid") return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
