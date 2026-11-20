"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, LoaderCircle, Send } from "lucide-react";

type Ticket = { id: string; reference: string; subject: string; category: string; status: string; messages: Array<{ visibility: string; authorName: string; body: string; createdAt: string }> };
const categories = [["contribution_dispute", "Contribution dispute"], ["payout_dispute", "Payout dispute"], ["group_membership", "Group membership"], ["account_access", "Account access"], ["payment_verification", "Payment verification"], ["other", "Other"]];

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [groupId, setGroupId] = useState("");
  const [ledgerReference, setLedgerReference] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try { const response = await fetch("/api/chama/support/tickets", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load support tickets."); setTickets(result.items ?? []); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load support tickets."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const createTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setMessage("");
    const response = await fetch("/api/chama/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, description, category, groupId: groupId || undefined, ledgerReference: ledgerReference || undefined }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to create ticket."); return; }
    setMessage("Ticket " + result.reference + " created."); setSubject(""); setDescription(""); setGroupId(""); setLedgerReference(""); void load();
  };
  const respond = async (ticketId: string) => {
    const text = reply[ticketId]?.trim() ?? "";
    const response = await fetch("/api/chama/support/tickets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, message: text }) });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Unable to send reply.");
    else { setReply((current) => ({ ...current, [ticketId]: "" })); void load(); }
  };
  return <div className="mx-auto max-w-5xl space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Help and disputes</p><h1 className="mt-1 text-2xl font-semibold">Support centre</h1><p className="mt-1 text-sm text-[var(--muted)]">Create a case with an optional group and ledger reference. Staff can investigate, but this support flow cannot change financial records.</p></header>
    {error ? <p role="alert" className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</p> : null}{message ? <p className="rounded-lg border border-emerald-300/50 p-3 text-sm text-emerald-700">{message}</p> : null}
    <form onSubmit={(event) => void createTicket(event)} className="glass-panel space-y-3 p-4 sm:p-5"><h2 className="font-semibold">Open a support ticket</h2><div className="grid gap-3 md:grid-cols-2"><label className="text-xs text-[var(--muted)]">Category<select className="glass-input mt-1 !min-h-10 !py-2" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs text-[var(--muted)]">Subject<input className="glass-input mt-1 !min-h-10 !py-2" required minLength={5} maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="text-xs text-[var(--muted)]">Group ID (optional)<input className="glass-input mt-1 !min-h-10 !py-2" value={groupId} onChange={(event) => setGroupId(event.target.value)} /></label><label className="text-xs text-[var(--muted)]">Ledger reference (optional)<input className="glass-input mt-1 !min-h-10 !py-2" value={ledgerReference} onChange={(event) => setLedgerReference(event.target.value)} /></label></div><label className="block text-xs text-[var(--muted)]">Describe the issue<textarea className="glass-input mt-1 min-h-24" required minLength={10} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></label><button className="dashboard-export-button"><Send size={14} />Create ticket</button></form>
    <section className="space-y-3"><h2 className="flex items-center gap-2 font-semibold"><LifeBuoy size={16} className="text-[var(--button-bg)]" />Your tickets</h2>{loading ? <div className="glass-panel p-6 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading tickets…</div> : tickets.length === 0 ? <div className="glass-panel p-8 text-center text-sm text-[var(--muted)]">No support tickets yet.</div> : tickets.map((ticket) => <article key={ticket.id} className="glass-panel p-4"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><p className="font-mono text-[10px] text-[var(--muted)]">{ticket.reference} · {ticket.category.replaceAll("_", " ")}</p><h3 className="mt-1 font-semibold">{ticket.subject}</h3></div><span className="text-xs">{ticket.status.replaceAll("_", " ")}</span></div><div className="mt-4 space-y-2">{ticket.messages.map((item, index) => <div key={index} className="rounded-lg border border-[var(--dash-border)] p-3"><p className="text-xs font-semibold">{item.authorName} · {new Date(item.createdAt).toLocaleString("en-KE")}</p><p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p></div>)}</div>{!["RESOLVED", "CLOSED"].includes(ticket.status) ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className="glass-input !min-h-10 flex-1 !py-2" value={reply[ticket.id] ?? ""} onChange={(event) => setReply((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Add a reply" /><button className="dashboard-export-button" disabled={(reply[ticket.id] ?? "").trim().length < 2} onClick={() => void respond(ticket.id)}>Reply</button></div> : null}</article>)}</section>
  </div>;
}
