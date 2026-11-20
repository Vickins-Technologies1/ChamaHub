"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, LoaderCircle, ShieldAlert, Users, Wallet } from "lucide-react";
import { formatMinorUnits } from "@/lib/finance/money";

type Tab = "overview" | "groups" | "transactions" | "subscriptions" | "activity" | "security" | "notes";
type Row = Record<string, unknown>;
type Profile = { user?: Row; groups?: Row[]; transactions?: Row[]; activity?: Row[]; notes?: Row[]; security?: { activeSessions: number; loginHistoryAvailable: boolean; passwordResetAvailable: boolean }; subscriptionsAvailable?: boolean };
const tabs: Array<{ id: Tab; label: string }> = [{ id: "overview", label: "Overview" }, { id: "groups", label: "Groups" }, { id: "transactions", label: "Transactions" }, { id: "subscriptions", label: "Subscriptions" }, { id: "activity", label: "Activity" }, { id: "security", label: "Security" }, { id: "notes", label: "Notes" }];

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date || typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function money(row: Row) {
  if (typeof row.amountMinor === "number" && typeof row.currency === "string") {
    try { return formatMinorUnits(row.amountMinor, row.currency); } catch { return `${row.currency} ${row.amountMinor} minor units`; }
  }
  if (typeof row.legacyAmountMajor === "number") return `${String(row.currency ?? "")} ${row.legacyAmountMajor.toLocaleString()} · legacy amount`;
  return "Historic amount unavailable";
}

export default function AdminUserDetail({ userId, canSuspend, canWrite, canRevokeSessions }: { userId: string; canSuspend: boolean; canWrite: boolean; canRevokeSessions: boolean }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load this account.");
      setProfile(result as Profile);
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "Unable to load this account."); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const account = profile?.user ?? {};
  const runAction = async (action: string, extra: Row = {}) => {
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to complete this action.");
      setMessage(action === "revoke-sessions" ? `Revoked ${result.revoked} active session${result.revoked === 1 ? "" : "s"}.` : action === "send-password-recovery" ? result.message ?? "Recovery instructions were sent." : action === "add-note" ? "Internal note added." : "Account status updated.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete this action."); }
    finally { setPending(false); }
  };
  const addNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAction("add-note", { text: note });
    setNote("");
  };

  return <div className="space-y-5">
    <div><Link href="/admin/users" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--button-bg)]"><ArrowLeft size={14} />All users</Link><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">User profile</p><h2 className="mt-1 text-2xl font-semibold">{display(account.name)}</h2><p className="mt-1 text-sm text-[var(--muted)]">{display(account.email)} · <span className="font-mono">{userId}</span></p></div><div className="flex flex-wrap gap-2"><span className="rounded-full border border-[var(--dash-border)] px-3 py-1.5 text-xs capitalize">{display(account.role)}</span><span className="rounded-full border border-[var(--dash-border)] px-3 py-1.5 text-xs capitalize">{display(account.status)}</span>
      {canSuspend ? <button className="dashboard-export-button" disabled={pending} onClick={() => { const suspend = account.status !== "suspended"; if (!window.confirm(`${suspend ? "Suspend" : "Reactivate"} this account?`)) return; const reason = window.prompt(suspend ? "Reason for suspension (required):" : "Reason for reactivation (optional):", "") ?? ""; if (suspend && reason.trim().length < 5) { setError("Enter a reason of at least five characters."); return; } void runAction(suspend ? "suspend" : "reactivate", { reason }); }}>{account.status === "suspended" ? "Reactivate" : "Suspend"}</button> : null}
      {canRevokeSessions ? <button className="dashboard-export-button" disabled={pending} onClick={() => { if (window.confirm("Revoke all active sessions for this account?")) void runAction("revoke-sessions"); }}><KeyRound size={14} />Revoke sessions</button> : null}</div></div></div>

    {error ? <div role="alert" className="rounded-lg border border-rose-300/40 p-3 text-sm text-rose-600">{error}</div> : null}{message ? <div className="rounded-lg border border-emerald-300/40 p-3 text-sm text-emerald-700">{message}</div> : null}
    <section className="glass-panel overflow-x-auto"><div className="flex min-w-max gap-1 border-b border-[var(--dash-border)] p-2">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === item.id ? "bg-[var(--dash-sidebar-active)] text-[var(--button-bg)]" : "text-[var(--muted)] hover:bg-[var(--dash-sidebar-hover)]"}`}>{item.label}</button>)}</div><div className="p-4 sm:p-5">
      {loading && !profile ? <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]"><LoaderCircle size={16} className="mr-2 animate-spin" />Loading profile…</div> : null}
      {tab === "overview" && profile ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><InfoCard icon={<Users size={16} />} label="Group memberships" value={String(profile.groups?.length ?? 0)} /><InfoCard icon={<Wallet size={16} />} label="Recent ledger records" value={String(profile.transactions?.length ?? 0)} /><InfoCard icon={<KeyRound size={16} />} label="Active sessions" value={String(profile.security?.activeSessions ?? "Not available")} /></div><div className="rounded-xl border border-[var(--dash-border)] p-4"><h3 className="font-semibold">Account details</h3><dl className="mt-3 grid gap-4 sm:grid-cols-2"><Detail label="Name" value={account.name} /><Detail label="Email" value={account.email} /><Detail label="Platform role" value={account.role} /><Detail label="Registered" value={account.createdAt} /><Detail label="Last profile update" value={account.updatedAt} /></dl></div></div> : null}
      {tab === "groups" ? <DataTable headings={["Group", "Group status", "Member role", "Member status", "Joined"]} rows={profile?.groups ?? []} cells={(row) => [row.name, row.groupStatus, row.memberRole, row.memberStatus, row.joinedAt]} /> : null}
      {tab === "transactions" ? <DataTable headings={["Group", "Type", "Amount", "Status", "Reference", "Date"]} rows={profile?.transactions ?? []} cells={(row) => [row.groupName, row.type, money(row), row.status, row.reference, row.transactionDate]} /> : null}
      {tab === "subscriptions" ? <Unavailable title="Subscription records are not configured" detail="This project has no subscription or billing collections connected to the account system." /> : null}
      {tab === "activity" ? <><p className="mb-3 text-xs text-[var(--muted)]">Administrative changes linked to this account. User login events are not stored by the current app.</p><DataTable headings={["Time", "Action", "Actor", "Context"]} rows={profile?.activity ?? []} cells={(row) => [row.occurredAt, row.action, row.actorId, row.metadata]} /></> : null}
      {tab === "security" ? <div className="space-y-4"><div className="rounded-xl border border-[var(--dash-border)] p-4"><h3 className="font-semibold">Authentication sessions</h3><p className="mt-2 text-sm text-[var(--muted)]">{profile?.security?.activeSessions ?? 0} active session(s) reported by Clerk.</p>{canRevokeSessions ? <button className="mt-3 dashboard-export-button" disabled={pending || !profile?.security?.activeSessions} onClick={() => { if (window.confirm("Revoke all active sessions for this account?")) void runAction("revoke-sessions"); }}><KeyRound size={14} />Revoke all active sessions</button> : null}{canWrite ? <button className="mt-3 ml-2 dashboard-export-button" disabled={pending} onClick={() => { if (window.confirm("Send this user a link to the existing secure password recovery flow?")) void runAction("send-password-recovery"); }}><KeyRound size={14} />Send recovery instructions</button> : null}</div><div className="flex items-start gap-3 rounded-xl bg-[var(--dash-sidebar-hover)] p-4 text-sm text-[var(--muted)]"><ShieldAlert size={16} className="mt-0.5 shrink-0" /><span>Login history and password reset triggers are not available in the current authentication integration. Recovery instructions link to Clerk&apos;s existing verified email flow.</span></div><Unavailable title="Impersonation is not enabled" detail="The app has no server-side impersonation session flow yet. No user session can be switched from this control centre." /></div> : null}
      {tab === "notes" ? <div className="space-y-4"><p className="text-xs text-[var(--muted)]">Internal admin notes are visible only to authorized platform staff.</p>{canWrite ? <form onSubmit={(event) => void addNote(event)} className="flex flex-col gap-2 sm:flex-row"><textarea required maxLength={4000} className="glass-input min-h-20 flex-1" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a factual internal note…" /><button disabled={pending || note.trim().length === 0} className="dashboard-export-button self-start">Add note</button></form> : null}<div className="space-y-3">{(profile?.notes ?? []).map((entry) => <article key={String(entry.id)} className="rounded-xl border border-[var(--dash-border)] p-4"><p className="whitespace-pre-wrap text-sm">{display(entry.text)}</p><p className="mt-3 text-xs text-[var(--muted)]">{display(entry.authorName)} · {display(entry.createdAt)}</p></article>)}{(profile?.notes ?? []).length === 0 ? <p className="text-sm text-[var(--muted)]">No internal notes.</p> : null}</div></div> : null}
    </div></section>
  </div>;
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="glass-panel p-4"><div className="flex justify-between text-[var(--muted)]">{label}{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function Detail({ label, value }: { label: string; value: unknown }) { return <div><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 text-sm font-medium">{display(value)}</dd></div>; }
function DataTable({ headings, rows, cells }: { headings: string[]; rows: Row[]; cells: (row: Row) => unknown[] }) { return rows.length ? <div className="overflow-x-auto"><table className="dashboard-table min-w-[680px] w-full text-left"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{cells(row).map((value, cell) => <td key={cell} className="max-w-64 truncate">{typeof value === "string" && ["suspended", "active", "verified", "failed", "archived", "confirmed", "transferred"].includes(value) ? <span className="capitalize">{value}</span> : display(value)}</td>)}</tr>)}</tbody></table></div> : <p className="p-8 text-center text-sm text-[var(--muted)]">No records available.</p>; }
function Unavailable({ title, detail }: { title: string; detail: string }) { return <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--dash-border)] px-5 text-center"><ShieldAlert size={19} className="text-[var(--muted)]" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-1 max-w-md text-xs text-[var(--muted)]">{detail}</p></div>; }
