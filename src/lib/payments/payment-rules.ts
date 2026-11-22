import { toMinorUnits } from "@/lib/finance/money";

export type ManualPaymentMethod = "mpesa" | "bank" | "cash" | "other";
export type MemberPaymentStatus = "pending" | "under_review" | "confirmed" | "rejected";

const kenyaDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const normalizePaymentMethod = (value: unknown): { method: ManualPaymentMethod; label: string } => {
  const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 50) : "";
  const normalized = (label || "other").toLowerCase().replace(/[\s_-]+/g, "");
  if (["mpesa", "safaricom", "mobilemoney"].includes(normalized)) return { method: "mpesa", label: "M-Pesa" };
  if (normalized === "bank" || normalized === "banktransfer") return { method: "bank", label: "Bank" };
  if (normalized === "cash") return { method: "cash", label: "Cash" };
  return { method: "other", label: label || "Other" };
};

export const normalizePaymentReference = (value: unknown, method: ManualPaymentMethod) => {
  const reference = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (reference.length > 120) throw new Error("Payment references must be 120 characters or fewer.");
  const normalized = method === "mpesa"
    ? reference.replace(/\s+/g, "").toUpperCase()
    : reference.replace(/\s+/g, " ").toUpperCase();
  return { reference, normalized: normalized || null };
};

export const paymentReferenceSearchPattern = (normalizedReference: string) => {
  const escaped = Array.from(normalizedReference, (character) => {
    if (/\s/.test(character)) return "\\s+";
    return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("\\s*");
  return new RegExp(`^\\s*${escaped}\\s*$`, "i");
};

export const normalizePaymentNotes = (value: unknown) => {
  const notes = typeof value === "string" ? value.trim() : "";
  if (notes.length > 500) throw new Error("Payment notes must be 500 characters or fewer.");
  return notes;
};

export const parsePaymentDate = (value: unknown, now = new Date()) => {
  if (typeof value !== "string" || !value.trim()) throw new Error("Choose the date you made the payment.");
  const raw = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = dateOnly ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(parsed.getTime()) || (dateOnly && parsed.toISOString().slice(0, 10) !== raw)) {
    throw new Error("Enter a valid payment date.");
  }
  if (dateOnly ? raw > kenyaDate(now) : parsed.getTime() > now.getTime()) throw new Error("Payment date cannot be in the future.");
  return parsed;
};

export const parsePaymentAmount = (value: unknown, currency: string) => {
  try {
    return toMinorUnits(value, currency);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Enter a valid amount greater than zero.");
  }
};

export const canEditMemberPayment = (status: MemberPaymentStatus) => status === "pending" || status === "rejected";
export const canReviewMemberPayment = (status: MemberPaymentStatus) => status === "pending" || status === "under_review";
export const canAccessPaymentReceipt = (ownsPayment: boolean, canReview: boolean) => ownsPayment || canReview;
export const ledgerPaymentIdempotencyKey = (paymentId: string) => `payment:${paymentId}`;

export const isDuplicatePaymentCandidate = (args: {
  sameGroup: boolean;
  sameMember: boolean;
  sameAmount: boolean;
  sameMethod: boolean;
  withinOneDay: boolean;
}) => args.sameGroup && args.sameMember && args.sameAmount && args.sameMethod && args.withinOneDay;
