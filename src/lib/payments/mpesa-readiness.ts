const mpesaConfigurationKeys = [
  "MPESA_ENVIRONMENT",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_URL",
] as const;

export const getMpesaReadiness = (env: NodeJS.ProcessEnv = process.env) => {
  const missing: string[] = mpesaConfigurationKeys.filter((key) => !env[key]?.trim());
  const callbackUrl = env.MPESA_CALLBACK_URL?.trim();
  const validCallbackUrl = (() => {
    if (!callbackUrl) return false;
    try {
      const url = new URL(callbackUrl);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  })();
  if (callbackUrl && !validCallbackUrl) missing.push("MPESA_CALLBACK_URL (must use HTTPS)");
  return {
    ready: missing.length === 0,
    mode: env.MPESA_ENVIRONMENT?.trim() || "disabled",
    missing,
  };
};
