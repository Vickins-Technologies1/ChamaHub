export function userTicketFilter(userId: string) {
  return { createdBy: userId };
}

export function canUserReplyToTicket(ticket: { createdBy?: unknown; status?: unknown } | null, userId: string) {
  return Boolean(ticket && ticket.createdBy === userId && !["CLOSED", "RESOLVED"].includes(String(ticket.status)));
}

export function publicTicketMessages(messages: unknown) {
  return Array.isArray(messages)
    ? messages.filter((message): message is Record<string, unknown> => Boolean(message && typeof message === "object" && (message as Record<string, unknown>).visibility !== "internal"))
    : [];
}
