import { createHash } from "node:crypto";
import { Types } from "mongoose";
import type { PaymentReceiptInput } from "@/lib/payments/payment-service";

export const MAX_PAYMENT_RECEIPT_BYTES = 5 * 1024 * 1024;

export const detectReceiptContentType = (data: Buffer): PaymentReceiptInput["contentType"] | null => {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (data.length >= 5 && data.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
};

const sanitizeFilename = (value: string) => {
  const basename = value.split(/[\\/]/).pop() ?? "receipt";
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "receipt").slice(0, 120);
};

export async function parsePaymentReceipt(value: FormDataEntryValue | null): Promise<PaymentReceiptInput | null> {
  if (!value || typeof value === "string") return null;
  const file = value as File;
  if (typeof file.arrayBuffer !== "function" || !Number.isInteger(file.size)) throw new Error("Choose a valid receipt file.");
  if (file.size <= 0 || file.size > MAX_PAYMENT_RECEIPT_BYTES) throw new Error("Receipt files must be between 1 byte and 5 MB.");
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length <= 0 || data.length > MAX_PAYMENT_RECEIPT_BYTES) throw new Error("Receipt files must be between 1 byte and 5 MB.");
  const contentType = detectReceiptContentType(data);
  if (!contentType) throw new Error("Upload a JPEG, PNG, WebP image, or PDF receipt.");
  return {
    id: new Types.ObjectId(),
    filename: sanitizeFilename(file.name || "receipt"),
    contentType,
    size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    data,
  };
}
