import { describe, expect, it } from "vitest";
import { detectReceiptContentType } from "@/lib/payments/receipt";
import {
  canAccessPaymentReceipt,
  canEditMemberPayment,
  canReviewMemberPayment,
  isDuplicatePaymentCandidate,
  ledgerPaymentIdempotencyKey,
  normalizePaymentMethod,
  normalizePaymentNotes,
  normalizePaymentReference,
  paymentReferenceSearchPattern,
  parsePaymentAmount,
  parsePaymentDate,
} from "./payment-rules";

describe("manual payment rules", () => {
  it("normalizes approved methods and keeps other methods labeled", () => {
    expect(normalizePaymentMethod(" M-Pesa ")).toEqual({ method: "mpesa", label: "M-Pesa" });
    expect(normalizePaymentMethod("Bank Transfer")).toEqual({ method: "bank", label: "Bank" });
    expect(normalizePaymentMethod("Till 42")).toEqual({ method: "other", label: "Till 42" });
  });

  it("normalizes M-Pesa references without changing the value shown to the user", () => {
    expect(normalizePaymentReference(" ab 12 cd ", "mpesa")).toEqual({ reference: "ab 12 cd", normalized: "AB12CD" });
    const referencePattern = paymentReferenceSearchPattern("AB12CD");
    expect(referencePattern.test("ab 12 cd")).toBe(true);
    expect(referencePattern.test("AB12CE")).toBe(false);
  });

  it("rejects oversized references and notes rather than truncating them", () => {
    expect(() => normalizePaymentReference("R".repeat(121), "mpesa")).toThrow(/120 characters/i);
    expect(() => normalizePaymentNotes("n".repeat(501))).toThrow(/500 characters/i);
  });

  it("parses positive currency amounts into minor units", () => {
    expect(parsePaymentAmount("125.50", "KES")).toBe(12550);
    expect(() => parsePaymentAmount("0", "KES")).toThrow(/greater than zero/i);
  });

  it("accepts valid past dates and rejects invalid or future dates", () => {
    const now = new Date("2026-11-22T12:00:00.000Z");
    expect(parsePaymentDate("2026-11-21", now).toISOString()).toBe("2026-11-21T12:00:00.000Z");
    expect(() => parsePaymentDate("2026-02-30", now)).toThrow(/valid payment date/i);
    expect(() => parsePaymentDate("2026-11-23", now)).toThrow(/future/i);
  });

  it("allows member corrections only while pending or rejected", () => {
    expect(canEditMemberPayment("pending")).toBe(true);
    expect(canEditMemberPayment("rejected")).toBe(true);
    expect(canEditMemberPayment("under_review")).toBe(false);
    expect(canEditMemberPayment("confirmed")).toBe(false);
  });

  it("allows review only before a decision and gives ledger posts a stable idempotency key", () => {
    expect(canReviewMemberPayment("pending")).toBe(true);
    expect(canReviewMemberPayment("under_review")).toBe(true);
    expect(canReviewMemberPayment("rejected")).toBe(false);
    expect(canReviewMemberPayment("confirmed")).toBe(false);
    expect(ledgerPaymentIdempotencyKey("abc123")).toBe("payment:abc123");
  });

  it("allows receipt access only to the submitting member or an authorized reviewer", () => {
    expect(canAccessPaymentReceipt(true, false)).toBe(true);
    expect(canAccessPaymentReceipt(false, true)).toBe(true);
    expect(canAccessPaymentReceipt(false, false)).toBe(false);
  });

  it("accepts only supported receipt file signatures", () => {
    expect(detectReceiptContentType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png");
    expect(detectReceiptContentType(Buffer.from([255, 216, 255, 0]))).toBe("image/jpeg");
    expect(detectReceiptContentType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(detectReceiptContentType(Buffer.from("MZ executable"))).toBeNull();
  });

  it("flags matching amount, method and date submissions from the same member and group", () => {
    const match = { sameGroup: true, sameMember: true, sameAmount: true, sameMethod: true, withinOneDay: true };
    expect(isDuplicatePaymentCandidate(match)).toBe(true);
    expect(isDuplicatePaymentCandidate({ ...match, sameMember: false })).toBe(false);
  });
});
