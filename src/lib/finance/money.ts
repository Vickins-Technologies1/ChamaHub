const CURRENCY_CODE = /^[A-Z]{3}$/;

export const getCurrencyFractionDigits = (currency: string) => {
  if (!CURRENCY_CODE.test(currency)) throw new Error("Currency must be a three-letter ISO code.");
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    throw new Error("Unsupported currency code.");
  }
};

const parseMinorUnits = (value: unknown, currency: string, allowZero: boolean): number => {
  const digits = getCurrencyFractionDigits(currency);
  const raw = typeof value === "number" && Number.isFinite(value) ? String(value) :
    typeof value === "string" ? value.trim() : "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) {
    throw new Error("Enter a valid positive amount.");
  }

  const [whole, fraction = ""] = raw.split(".");
  const excess = fraction.slice(digits);
  if (excess && /[1-9]/.test(excess)) {
    throw new Error(`Amount supports at most ${digits} decimal places for ${currency}.`);
  }
  const minorText = `${whole}${fraction.slice(0, digits).padEnd(digits, "0")}`;
  const minor = Number(minorText);
  if (!Number.isSafeInteger(minor) || (allowZero ? minor < 0 : minor <= 0)) {
    throw new Error(allowZero ? "Amount is outside the supported range." : "Amount must be greater than zero and within the supported range.");
  }
  return minor;
};

export const toMinorUnits = (value: unknown, currency: string) => parseMinorUnits(value, currency, false);
export const toNonNegativeMinorUnits = (value: unknown, currency: string) => parseMinorUnits(value, currency, true);

export const fromMinorUnits = (amountMinor: number, currency: string) => {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Amount must be a safe integer in minor units.");
  return amountMinor / 10 ** getCurrencyFractionDigits(currency);
};

export const formatMinorUnits = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(
    fromMinorUnits(amountMinor, currency)
  );
