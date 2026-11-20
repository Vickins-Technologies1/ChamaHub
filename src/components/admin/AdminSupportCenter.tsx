"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, LoaderCircle, RefreshCw, Send, ShieldAlert } from "lucide-react";

type Message = { visibility: string; authorName: string; body: string; createdAt: string };
type Ticket = { id: string; reference: string; subject: string; category: string; priority: string; status: string; createdBy: string; createdByName: string; assignedTo: string | null; groupId: string | null; ledgerReference: string | null; messages: Message[]; createdAt: string; updatedAt: string };
function pretty(value: string | null | undefined) { return value ? new Date(value).toLocaleString("en-KE") : "—"; }

export default function AdminSupportCenter({ userId, canManage, canRespond }: { userId: string; canManage: boolean; canRespond: boolean }) {
  const [items, setItems] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [reply, setReply] = useState("");
  const [assignment, setAssignment] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      const response = await fetch("/api/admin/support/tickets?" + params.toString(), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load support tickets.");
      setItems(result.items ?? []);
      if (selected) setSelected((result.items ?? []).find((item: Ticket) => item.id === selected.id) ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load support tickets."); }
    finally { setLoading(false); }
  }, [status, search, selected]);
  useEffect(() => { void load(); }, [load, refresh]);

  const action = async (body: Record<string, unknown>) => {
    if (!selected) return;
    setError(""); setMessage("");
    const response = await fetch("/api/admin/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId: selected.id, ...body }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error ?? "Unable to update this ticket."); return; }
    setMessage("Ticket updated.");
    setRefresh((value) => value + 1);
  };
  const sendMessage = async (kind: "reply" | "note") => {
    if (reply.trim().length < 2) return;
    await action({ action: kind, message: reply.trim() });
    setReply("");
  };

  return <div className="space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Customer support</p><div className="mt-1 flex items-center justify-between"><div><h2 className="text-2xl font-semibold">Support and dispute desk</h2><p className="mt-1 text-sm text-[var(--muted)]">Investigate account, group and payment issues with ticket-linked ledger references. Financial records remain read only.</p></div><button className="dash-icon-btn" onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh tickets"><RefreshCw size={15} /></button></div></header>
    {error ? <p role="alert" className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</p> : null}{message ? <p className="rounded-lg border border-emerald-300/50 p-3 text-sm text-emerald-700">{message}</p> : null}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
      <section className="glass-panel overflow-hidden"><div className="flex flex-col gap-2 border-b border-[var(--dash-border)] p-3 sm:flex-row"><input className="glass-input !min-h-10 !py-2" placeholder="Search reference, subject or account" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Ticket status" className="glass-input !min-h-10 !py-2" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["OPEN", "IN_PROGRESS", "PENDING", "ESCALATED", "RESOLVED", "CLOSED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>{loading ? <p className="p-6 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading tickets…</p> : <div className="divide-y divide-[var(--dash-border)]">{items.map((ticket) => <button key={ticket.id} onClick={() => { setSelected(ticket); setAssignment(ticket.assignedTo ?? userId); }} className={selected?.id === ticket.id ? "block w-full bg-[var(--dash-sidebar-hover)] p-4 text-left" : "block w-full p-4 text-left hover:bg-[var(--dash-sidebar-hover)]"}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{ticket.subject}</p><p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{ticket.reference} · {ticket.createdByName}</p><p className="mt-1 text-xs capitalize text-[var(--muted)]">{ticket.category.replaceAll("_", " ")} · {ticket.priority} · {ticket.status.replaceAll("_", " ")}</p></div><span className="text-[10px] text-[var(--muted)]">{pretty(ticket.updatedAt)}</span></div></button>)}{items.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">No tickets match these filters.</p> : null}</div>}</section>
      <section className="glass-panel min-h-96 overflow-hidden">{selected ? <><div className="border-b border-[var(--dash-border)] p-4"><p className="font-mono text-xs text-[var(--muted)]">{selected.reference}</p><h3 className="mt-1 font-semibold">{selected.subject}</h3><p className="mt-1 text-xs text-[var(--muted)]">{selected.createdByName} · account {selected.createdBy}</p>{selected.groupId ? <p className="mt-1 text-xs text-[var(--muted)]">Group {selected.groupId} · ledger reference {selected.ledgerReference ?? "not provided"}</p> : null}</div>
        {canManage ? <div className="grid gap-2 border-b border-[var(--dash-border)] p-3 sm:grid-cols-2"><label className="text-[10px] text-[var(--muted)]">Status<select className="glass-input mt-1 !min-h-9 !py-1.5" value={selected.status} onChange={(event) => { const value = event.target.value; const resolution = value === "RESOLVED" || value === "CLOSED" ? window.prompt("Resolution note (optional):", "") ?? "" : ""; void action({ action: "status", status: value, resolution }); }}>{["OPEN", "IN_PROGRESS", "PENDING", "ESCALATED", "RESOLVED", "CLOSED"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-[10px] text-[var(--muted)]">Priority<select className="glass-input mt-1 !min-h-9 !py-1.5" value={selected.priority} onChange={(event) => void action({ action: "priority", priority: event.target.value })}>{["low", "normal", "high", "urgent"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-[10px] text-[var(--muted)] sm:col-span-2">Assign to active support user ID<input className="glass-input mt-1 !min-h-9 !py-1.5" value={assignment} onChange={(event) => setAssignment(event.target.value)} /></label><button className="dashboard-export-button sm:col-span-2" onClick={() => void action({ action: "assign", assignedTo: assignment })}>Assign ticket</button></div> : null}
        <div className="max-h-[440px] space-y-3 overflow-y-auto p-4">{selected.messages.map((entry, index) => <article key={index} className={entry.visibility === "internal" ? "rounded-lg border border-amber-300/50 bg-amber-500/5 p-3" : "rounded-lg border border-[var(--dash-border)] p-3"}><div className="flex justify-between gap-2"><p className="text-xs font-semibold">{entry.authorName}{entry.visibility === "internal" ? " · Internal note" : ""}</p><time className="text-[10px] text-[var(--muted)]">{pretty(entry.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm">{entry.body}</p></article>)}</div>
        {(canRespond || canManage) ? <div className="border-t border-[var(--dash-border)] p-3"><textarea className="glass-input min-h-20" maxLength={4000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to the user or add an internal note…" /><div className="mt-2 flex flex-wrap gap-2">{canRespond ? <button className="dashboard-export-button" disabled={reply.trim().length < 2} onClick={() => void sendMessage("reply")}><Send size={13} />Send user reply</button> : null}{canRespond || canManage ? <button className="dashboard-export-button" disabled={reply.trim().length < 2} onClick={() => void sendMessage("note")}><ShieldAlert size={13} />Add internal note</button> : null}</div></div> : null}
      </> : <div className="flex min-h-96 flex-col items-center justify-center p-6 text-center"><LifeBuoy size={20} className="text-[var(--muted)]" /><h3 className="mt-3 font-semibold">Select a support ticket</h3><p className="mt-1 text-xs text-[var(--muted)]">User replies and internal investigation notes stay separate.</p></div>}</section>
    </div>
  </div>;
}
