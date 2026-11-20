import transporter from "@/lib/nodemailer";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!transporter || !process.env.EMAIL_USER) {
    throw new Error("Email delivery is not configured. Set EMAIL_USER and EMAIL_PASS.");
  }
  await transporter.sendMail({ from: process.env.EMAIL_USER, ...input });
}
