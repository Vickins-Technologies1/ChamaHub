"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, Plus, RefreshCw, ShieldCheck, UserRoundCog } from "lucide-react";

type Row = Record<string, unknown>;
const permissions = [
  "dashboard.read", "users.read", "users.write", "users.suspend", "users.sessions.revoke", "users.impersonate",
  "groups.read", "groups.write", "finance.read", "staff.read", "staff.write", "staff.impersonate",
  "notifications.read", "notifications.write", "support.tickets.read", "support.tickets.manage", "support.tickets.respond",
  "audit.read", "system.read", "system.settings.write", "features.write", "security.read", "security.write", "analytics.read", "reports.export",
];

function date(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)));
}

export default function AdminStaffCenter({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Row[]>([]);
  const [invites, setInvites] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<Row | null>(null);
  const [mode, setMode] = useState<"invite" | "existing">("invite");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("MODERATOR");
  const [expiry, setExpiry] = useState("");
  const [selected, setSelected] = useState<string[]>(["groups.read", "users.read"]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/staff?page=1&pageSize=100", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load staff records.");
      setItems(result.items ?? []);
      setInvites(result.invitations ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load staff records."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refresh]);

  const resetForm = () => {
    setEditing(null); setEmail(""); setUserId(""); setRole("MODERATOR"); setExpiry(""); setSelected(["groups.read", "users.read"]); setMode("invite");
  };
  const beginEdit = (row: Row) => {
    setEditing(row);
    setMode("existing");
    setUserId(String(row.userId));
    setRole(String(row.role));
    setExpiry(row.expiresAt ? new Date(String(row.expiresAt)).toISOString().slice(0, 10) : "");
    setSelected(Array.isArray(row.permissions) ? row.permissions as string[] : []);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const action = editing ? "update" : mode === "invite" ? "invite" : "grant";
      const response = await fetch("/api/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, userId, role, permissions: selected, expiresAt: expiry ? new Date(expiry + "T23:59:59").toISOString() : null }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save staff access.");
      resetForm(); setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save staff access."); }
    finally { setSaving(false); }
  };
  const postAction = async (body: Row, label: string) => {
    setError("");
    try {
      const response = await fetch("/api/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to complete the staff action.");
      setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to complete the staff action."); }
  };

  if (!canManage) return <div className="glass-panel p-5 text-sm text-[var(--muted)]">Only the Super Admin can view or change administrative grants.</div>;
  return <div className="space-y-5">
    <header className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Governance</p><h2 className="mt-1 text-2xl font-semibold">Staff management</h2><p className="mt-1 text-sm text-[var(--muted)]">Invite staff, manage module permissions, and review recorded administrative activity.</p></div><button className="dash-icon-btn" onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh staff list"><RefreshCw size={15} /></button></header>
    {error ? <div role="alert" className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</div> : null}
    <section className="glass-panel p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">{editing ? "Edit staff permissions" : "Add administrative access"}</h3><p className="mt-1 text-xs text-[var(--muted)]">The Super Admin controls all staff grants, including high privilege permissions.</p></div>{editing ? <button className="dashboard-export-button" onClick={resetForm}>Cancel edit</button> : <Plus size={17} className="text-[var(--button-bg)]" />}</div>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {!editing ? <div className="flex gap-2"><button type="button" className="dashboard-export-button" onClick={() => setMode("invite")}>Invite by email</button><button type="button" className="dashboard-export-button" onClick={() => setMode("existing")}>Existing account</button></div> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          {!editing && mode === "invite" ? <label className="text-xs text-[var(--muted)]">Work email<input required type="email" className="glass-input mt-1 !min-h-10 !py-2" value={email} onChange={(event) => setEmail(event.target.value)} /></label> : <label className="text-xs text-[var(--muted)]">Account ID<input required readOnly={Boolean(editing)} className="glass-input mt-1 !min-h-10 !py-2" value={userId} onChange={(event) => setUserId(event.target.value)} /></label>}
          <label className="text-xs text-[var(--muted)]">Access role<select className="glass-input mt-1 !min-h-10 !py-2" value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMIN">Administrator</option><option value="MODERATOR">Moderator</option><option value="SUPPORT">Support</option></select></label>
          <label className="text-xs text-[var(--muted)]">Access expires (optional)<input type="date" className="glass-input mt-1 !min-h-10 !py-2" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></label>
        </div>
        <div><p className="mb-2 text-xs font-semibold text-[var(--muted)]">Module permissions</p><div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{permissions.map((permission) => <label key={permission} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(permission)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} /><span>{permission}</span></label>)}</div></div>
        <button disabled={saving || selected.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[var(--button-bg)] px-4 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} />{saving ? "Saving…" : editing ? "Save permissions" : mode === "invite" ? "Send secure invitation" : "Grant access"}</button>
      </form>
    </section>
    <section className="glass-panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--dash-border)] p-4"><ShieldCheck size={16} className="text-[var(--button-bg)]" /><h3 className="font-semibold">Staff access and performance</h3></div>
      {loading ? <p className="p-6 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading staff records…</p> : <div className="overflow-x-auto"><table className="dashboard-table min-w-[1100px] w-full text-left"><thead><tr><th>Staff account</th><th>Role / permissions</th><th>Status / expiry</th><th>Recorded performance</th><th>Actions</th></tr></thead><tbody>
        {items.map((row) => { const metrics = row.metrics as Row | undefined; return <tr key={String(row.userId)}><td><p className="font-medium">{String(row.name ?? "Unnamed staff")}</p><p className="mt-1 text-xs text-[var(--muted)]">{String(row.email ?? "")}</p><p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{String(row.userId)}</p></td><td><p className="font-medium">{String(row.role)}</p><p className="mt-1 max-w-72 whitespace-normal text-xs text-[var(--muted)]">{Array.isArray(row.permissions) ? row.permissions.join(", ") : ""}</p></td><td><p className="capitalize">{String(row.status)}</p><p className="mt-1 text-xs text-[var(--muted)]">{date(row.expiresAt)}</p></td><td><p className="text-xs">Actions: {String(metrics?.totalActions ?? 0)} · Users: {String(metrics?.usersManaged ?? 0)} · Groups: {String(metrics?.groupsReviewed ?? 0)}</p><p className="mt-1 text-xs">Tickets: {String(metrics?.ticketsResolved ?? 0)} · Suspensions: {String(metrics?.suspensions ?? 0)}</p><p className="mt-1 text-xs text-[var(--muted)]">Last activity {date(metrics?.lastActivity)}</p></td><td><button className="dashboard-export-button !px-2" onClick={() => beginEdit(row)}>Edit permissions</button><button className="dashboard-export-button ml-2 !px-2" disabled={row.role === "SUPER_ADMIN"} onClick={() => { const action = row.status === "active" ? "suspend" : "activate"; if (window.confirm(action === "suspend" ? "Suspend this staff grant?" : "Reactivate this staff grant?")) void postAction({ action, userId: row.userId }, ""); }}>{row.status === "active" ? "Suspend" : "Reactivate"}</button><button className="ml-2 rounded-lg border border-rose-300/50 px-2 py-2 text-xs text-rose-600" disabled={row.role === "SUPER_ADMIN"} onClick={() => { if (window.confirm("Revoke this staff grant and all active sessions?")) void postAction({ action: "revoke", userId: row.userId }, ""); }}>Revoke</button><button className="dashboard-export-button ml-2 !px-2" disabled={row.role === "SUPER_ADMIN"} onClick={async () => { const reason = window.prompt("Investigation reason (at least 10 characters):", ""); if (!reason || reason.trim().length < 10) return; const response = await fetch("/api/admin/impersonation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: row.userId, reason: reason.trim() }) }); const result = await response.json(); if (!response.ok) setError(result.error ?? "Unable to start troubleshooting session."); else window.location.assign("/admin"); }}>Impersonate</button><a className="dashboard-export-button ml-2 !px-2" href={"/admin/staff/" + encodeURIComponent(String(row.userId))}><UserRoundCog size={13} />History</a></td></tr>; })}
        {items.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-sm text-[var(--muted)]">No staff grants are recorded.</td></tr> : null}
      </tbody></table></div>}
    </section>
    <section className="glass-panel overflow-hidden"><div className="border-b border-[var(--dash-border)] p-4"><h3 className="font-semibold">Invitations</h3><p className="mt-1 text-xs text-[var(--muted)]">Accepted, pending, revoked, expired and failed invitation states from the invitation store.</p></div><div className="overflow-x-auto"><table className="dashboard-table min-w-[780px] w-full text-left"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Expires</th><th></th></tr></thead><tbody>{invites.map((invite) => <tr key={String(invite.inviteId)}><td>{String(invite.email)}</td><td>{String(invite.role)}</td><td className="capitalize">{String(invite.status)}</td><td>{date(invite.createdAt)}</td><td>{date(invite.expiresAt)}</td><td>{invite.status === "pending" ? <button className="text-xs text-rose-600" onClick={() => { if (window.confirm("Revoke this staff invitation?")) void postAction({ action: "revoke-invitation", inviteId: invite.inviteId }, "invite"); }}>Revoke invitation</button> : invite.status === "claimed" ? "Accepted " + date(invite.claimedAt) : "—"}</td></tr>)}{invites.length === 0 ? <tr><td colSpan={6} className="p-6 text-sm text-[var(--muted)]">No invitations recorded.</td></tr> : null}</tbody></table></div></section>
  </div>;
}
