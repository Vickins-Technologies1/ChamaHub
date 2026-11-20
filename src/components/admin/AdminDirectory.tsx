"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowRight, Archive, Check, LoaderCircle, Plus, RefreshCw, Search, Shield, UserX } from "lucide-react";
import { formatMinorUnits } from "@/lib/finance/money";

export type AdminDirectoryKind = "users" | "groups" | "finance" | "audit" | "staff";
type Row = Record<string, unknown>;
type DirectoryResponse = { items?: Row[]; invitations?: Row[]; total?: number; page?: number; pageSize?: number };

const titles: Record<AdminDirectoryKind, { title: string; description: string; endpoint: string }> = {
  users: { title: "User management", description: "Search registered accounts and review their status and platform activity.", endpoint: "/api/admin/users" },
  groups: { title: "Savings groups", description: "Review group settings, participation, open rounds, and verified ledger summaries.", endpoint: "/api/admin/groups" },
  finance: { title: "Financial records", description: "Read-only view of the existing immutable financial transaction ledger.", endpoint: "/api/admin/finance" },
  audit: { title: "Administrative audit", description: "Append-only administrative changes and privileged report access.", endpoint: "/api/admin/audit" },
  staff: { title: "Admin staff", description: "Create time-limited invitations and manage granular platform access.", endpoint: "/api/admin/staff" },
};

const permissions = ["dashboard.read", "users.read", "users.write", "users.suspend", "users.sessions.revoke", "groups.read", "groups.write", "finance.read", "staff.read", "audit.read", "system.read"] as const;

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date || typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function StatusPill({ value }: { value: unknown }) {
  const text = typeof value === "string" ? value.replaceAll("_", " ") : "unknown";
  const good = ["active", "verified", "confirmed", "transferred", "registered"].includes(text);
  const bad = ["failed", "suspended", "revoked", "archived"].includes(text);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${good ? "bg-emerald-500/10 text-emerald-700" : bad ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-700"}`}>{text}</span>;
}

function formatAmount(row: Row) {
  if (typeof row.amountMinor === "number" && typeof row.currency === "string") {
    try { return formatMinorUnits(row.amountMinor, row.currency); } catch { return `${row.currency} · ${row.amountMinor} minor units`; }
  }
  if (typeof row.verifiedContributionAmountMinor === "number" && typeof row.currency === "string") {
    try { return formatMinorUnits(row.verifiedContributionAmountMinor, row.currency); } catch { return `${row.currency} · ${row.verifiedContributionAmountMinor} minor units`; }
  }
  return typeof row.legacyAmountMajor === "number" ? `${String(row.currency ?? "")} ${row.legacyAmountMajor.toLocaleString()} · legacy amount` : "Historic amount unavailable";
}

function columnsFor(kind: AdminDirectoryKind) {
  if (kind === "users") return ["Account", "Email", "Phone", "Role", "Status", "Registered"];
  if (kind === "groups") return ["Group", "Status", "Members", "Owner account", "Verified entries", "Verified amount", "Created"];
  if (kind === "finance") return ["Transaction", "Group", "Type", "Amount", "Status", "Reference", "Date"];
  if (kind === "audit") return ["Time", "Actor", "Role", "Action", "Target", "IP address"];
  return ["Staff account", "Role", "Permissions", "Status", "Access expires", "Granted"];
}

export default function AdminDirectory({ kind, canWrite = false, isSuperAdmin = false }: { kind: AdminDirectoryKind; canWrite?: boolean; isSuperAdmin?: boolean }) {
  const config = titles[kind];
  const [rows, setRows] = useState<Row[]>([]);
  const [invitations, setInvitations] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    return params;
  }, [page, search, status, type]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const requestParams = new URLSearchParams(query);
      requestParams.set("refresh", String(refreshKey));
      const response = await fetch(`${config.endpoint}?${requestParams.toString()}`, { cache: "no-store", signal });
      const result = await response.json() as DirectoryResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to load records.");
      setRows(result.items ?? []);
      setInvitations(result.invitations ?? []);
      setTotal(result.total ?? 0);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unable to load records.");
    } finally {
      setLoading(false);
    }
  }, [config.endpoint, query, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const postAction = async (url: string, body: Row, label: string) => {
    setAction(label);
    setError("");
    try {
      const response = await fetch(url, { method: kind === "staff" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The action could not be completed.");
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action could not be completed.");
    } finally {
      setAction("");
    }
  };

  const columns = columnsFor(kind);
  const maxPage = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Control centre</p><h2 className="mt-1 text-2xl font-semibold">{config.title}</h2><p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{config.description}</p></div>
        {kind === "finance" || kind === "audit" ? <a className="dashboard-export-button" href={`${config.endpoint}?${new URLSearchParams({ ...Object.fromEntries(query), format: "csv" }).toString()}`}><ArrowDownToLine size={14} /> Export page</a> : null}
      </header>

      {kind === "staff" && isSuperAdmin ? <StaffGrantForm onCreated={() => setRefreshKey((value) => value + 1)} /> : null}

      <section className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--dash-border)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={submitSearch} className="flex w-full gap-2 lg:max-w-xl">
            <div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className="glass-input !min-h-10 !pl-9 !py-2" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={kind === "users" ? "Name, email, phone, or account ID" : kind === "groups" ? "Group name, ID, or owner ID" : kind === "finance" ? "Reference, group, member, or transaction ID" : kind === "staff" ? "Filter by account after load" : "Action, actor ID, or target"} /></div>
            <button className="dashboard-export-button" type="submit">Search</button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {kind === "users" ? <select aria-label="User status" className="glass-input !min-h-10 !w-auto !py-2" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All account states</option><option value="registered">Registered</option><option value="suspended">Suspended</option></select> : null}
            {kind === "groups" ? <select aria-label="Group status" className="glass-input !min-h-10 !w-auto !py-2" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All groups</option><option value="active">Active</option><option value="archived">Archived</option></select> : null}
            {kind === "finance" ? <><select aria-label="Transaction type" className="glass-input !min-h-10 !w-auto !py-2" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">All transaction types</option>{["contribution", "payout", "refund", "adjustment", "reversal"].map((value) => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Transaction status" className="glass-input !min-h-10 !w-auto !py-2" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{["pending_verification", "verified", "pending_transfer", "transferred", "confirmed", "failed", "reversed", "legacy_unverified"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></> : null}
            <button type="button" className="dash-icon-btn" aria-label="Refresh list" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={15} /></button>
          </div>
        </div>
        {error ? <div className="mx-4 mt-4 rounded-lg border border-rose-300/40 bg-rose-500/5 p-3 text-sm text-rose-600">{error}</div> : null}
        <div className="overflow-x-auto">
          <table className="dashboard-table min-w-[900px] w-full text-left">
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{kind === "users" || kind === "groups" || kind === "staff" && isSuperAdmin ? <th>Actions</th> : null}</tr></thead>
            <tbody>
              {loading && rows.length === 0 ? <tr><td colSpan={columns.length + 1} className="p-8 text-center text-sm text-[var(--muted)]"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Loading records…</td></tr> : null}
              {!loading && rows.length === 0 ? <tr><td colSpan={columns.length + 1} className="p-10 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--dash-sidebar-hover)] text-[var(--muted)]"><AlertTriangle size={17} /></div><p className="mt-3 text-sm font-medium">No matching records</p><p className="mt-1 text-xs text-[var(--muted)]">Try another search or filter.</p></td></tr> : null}
              {rows.map((row, index) => {
                const id = String(row.id ?? row.userId ?? row.inviteId ?? row._id ?? index);
                return <tr key={id}>
                  {kind === "users" ? <><td><Link href={`/admin/users/${encodeURIComponent(id)}`} className="font-semibold text-[var(--button-bg)] hover:underline">{asText(row.name) === "—" ? "Unnamed account" : asText(row.name)}</Link><span className="mt-1 block max-w-44 truncate text-[10px] text-[var(--muted)]">{id}</span></td><td>{asText(row.email)}</td><td>{asText(row.phone)}</td><td><StatusPill value={row.role} /></td><td><StatusPill value={row.status} /></td><td>{asText(row.createdAt)}</td></> : null}
                  {kind === "groups" ? <><td><Link href={`/admin/groups/${encodeURIComponent(id)}`} className="font-semibold text-[var(--button-bg)] hover:underline">{asText(row.name)}</Link><span className="mt-1 block text-[10px] text-[var(--muted)]">{id}</span></td><td><StatusPill value={row.status} /></td><td>{asText(row.activeMembers)} / {asText(row.membersCount)}</td><td className="max-w-32 truncate">{asText(row.createdBy)}</td><td>{asText(row.verifiedContributionCount)}</td><td>{formatAmount(row)}</td><td>{asText(row.createdAt)}</td></> : null}
                  {kind === "finance" ? <><td><span className="font-mono text-xs">{id}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{asText(row.groupId)}</span></td><td>{asText(row.groupName)}</td><td className="capitalize">{asText(row.type)} · {asText(row.direction)}</td><td>{formatAmount(row)}</td><td><StatusPill value={row.status} /></td><td>{asText(row.reference)}</td><td>{asText(row.transactionDate)}</td></> : null}
                  {kind === "audit" ? <><td>{asText(row.occurredAt)}</td><td className="max-w-36 truncate">{asText(row.actorId)}</td><td><StatusPill value={row.actorRole} /></td><td className="font-medium">{asText(row.action)}</td><td><span>{asText(row.entityType)}</span><span className="mt-1 block max-w-40 truncate text-[10px] text-[var(--muted)]">{asText(row.entityId)}</span></td><td>{asText(row.ipAddress)}</td></> : null}
                  {kind === "staff" ? <><td><span className="font-medium">{asText(row.name)}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{asText(row.email)} · {asText(row.userId)}</span></td><td><StatusPill value={row.role} /></td><td className="max-w-60 whitespace-normal">{asText(row.permissions)}</td><td><StatusPill value={row.status} /></td><td>{asText(row.expiresAt)}</td><td>{asText(row.createdAt)}</td></> : null}
                  {kind === "users" && canWrite ? <td><button className="dashboard-export-button !px-2" disabled={Boolean(action)} onClick={async () => {
                    const suspending = row.status !== "suspended";
                    if (!window.confirm(`${suspending ? "Suspend" : "Reactivate"} ${String(row.email ?? id)}?`)) return;
                    const reason = suspending ? window.prompt("Reason for this account suspension (required):", "") : window.prompt("Reason for reactivation (optional):", "") ?? "";
                    if (suspending && (!reason || reason.trim().length < 5)) { setError("Enter a reason of at least five characters."); return; }
                    await postAction(`/api/admin/users/${encodeURIComponent(id)}`, { action: suspending ? "suspend" : "reactivate", reason }, id);
                  }}><UserX size={13} />{row.status === "suspended" ? "Reactivate" : "Suspend"}</button></td> : null}
                  {kind === "groups" && canWrite ? <td><button className="dashboard-export-button !px-2" disabled={Boolean(action)} onClick={async () => {
                    const archiving = row.status !== "archived";
                    if (!window.confirm(`${archiving ? "Archive" : "Reactivate"} ${String(row.name ?? "this group")}?`)) return;
                    await postAction(`/api/admin/groups/${encodeURIComponent(id)}`, { action: archiving ? "archive" : "activate" }, id);
                  }}><Archive size={13} />{row.status === "archived" ? "Reactivate" : "Archive"}</button></td> : null}
                  {kind === "staff" && isSuperAdmin ? <td><button className="dashboard-export-button !px-2" disabled={Boolean(action) || row.role === "SUPER_ADMIN"} onClick={async () => {
                    const next = row.status === "active" ? "suspend" : "activate";
                    if (!window.confirm(`${next === "suspend" ? "Suspend" : "Restore"} access for ${String(row.email ?? "this administrator")}?`)) return;
                    await postAction(config.endpoint, { action: next, userId: row.userId }, id);
                  }}>{row.status === "active" ? "Suspend" : "Activate"}</button><button className="ml-2 rounded-lg border border-rose-300/50 px-2 py-2 text-xs text-rose-600" disabled={Boolean(action)} onClick={async () => {
                    if (!window.confirm(`Revoke administrative access for ${String(row.email ?? "this account")}?`)) return;
                    await postAction(config.endpoint, { action: "revoke", userId: row.userId }, id);
                  }}>Revoke</button></td> : null}
                </tr>;
              })}
              {kind === "staff" && invitations.map((invite, index) => <tr key={String(invite._id ?? index)}><td><span className="font-medium">{asText(invite.email)}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">Invitation pending</span></td><td><StatusPill value={invite.role} /></td><td className="max-w-60 whitespace-normal">{asText(invite.permissions)}</td><td><StatusPill value="pending" /></td><td>{asText(invite.expiresAt)}</td><td>{asText(invite.createdAt)}</td><td>Invitation sent</td></tr>)}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t border-[var(--dash-border)] px-4 py-3"><span className="text-xs text-[var(--muted)]">{total === 0 ? "0 records" : `${((page - 1) * 25 + 1).toLocaleString()}–${Math.min(page * 25, total).toLocaleString()} of ${total.toLocaleString()}`}</span><div className="flex items-center gap-2"><button className="dashboard-pagination-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ArrowLeft size={14} /></button><span className="text-xs text-[var(--muted)]">{page} / {maxPage}</span><button className="dashboard-pagination-button" disabled={page >= maxPage} onClick={() => setPage((value) => Math.min(maxPage, value + 1))} aria-label="Next page"><ArrowRight size={14} /></button></div></footer>
      </section>

      {kind === "staff" && !isSuperAdmin ? <div className="glass-panel flex items-start gap-3 p-4 text-sm text-[var(--muted)]"><Shield size={16} className="mt-0.5 shrink-0" />Only a Super Admin can see or change administrative grants.</div> : null}
    </div>
  );
}

function StaffGrantForm({ onCreated }: { onCreated: () => void }) {
  const [mode, setMode] = useState<"invite" | "existing">("invite");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("MODERATOR");
  const [expiresAt, setExpiresAt] = useState("");
  const [selected, setSelected] = useState<string[]>(["groups.read", "users.read"]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode === "invite" ? "invite" : "grant", email, userId, role, permissions: selected, expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save administrative access.");
      setEmail(""); setUserId("");
      onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save administrative access."); }
    finally { setSaving(false); }
  };

  return <section className="glass-panel p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-semibold">Add administrative access</h3><p className="mt-1 text-xs text-[var(--muted)]">Permissions are stored in the platform access registry. Group roles remain separate.</p></div><Plus size={17} className="text-[var(--button-bg)]" /></div>
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="flex gap-2"><button type="button" onClick={() => setMode("invite")} className={`dashboard-export-button ${mode === "invite" ? "border-[var(--button-bg)] text-[var(--button-bg)]" : ""}`}>Invite by email</button><button type="button" onClick={() => setMode("existing")} className={`dashboard-export-button ${mode === "existing" ? "border-[var(--button-bg)] text-[var(--button-bg)]" : ""}`}>Existing account</button></div>
      <div className="grid gap-3 md:grid-cols-3">
        {mode === "invite" ? <label className="text-xs text-[var(--muted)]">Work email<input required type="email" className="glass-input mt-1 !min-h-10 !py-2" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="moderator@example.com" /></label> : <label className="text-xs text-[var(--muted)]">ChamaPulse account ID<input required className="glass-input mt-1 !min-h-10 !py-2" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Paste account ID" /></label>}
        <label className="text-xs text-[var(--muted)]">Access role<select className="glass-input mt-1 !min-h-10 !py-2" value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMIN">Admin</option><option value="MODERATOR">Moderator</option><option value="SUPPORT">Support</option></select></label>
        <label className="text-xs text-[var(--muted)]">Access expires (optional)<input type="date" className="glass-input mt-1 !min-h-10 !py-2" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
      </div>
      <div><p className="mb-2 text-xs font-semibold text-[var(--muted)]">Module permissions</p><div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{permissions.map((permission) => <label key={permission} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(permission)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))} /><span>{permission}</span></label>)}</div></div>
      {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3"><button disabled={saving || selected.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[var(--button-bg)] px-4 text-xs font-semibold text-white disabled:opacity-50"><Check size={14} />{saving ? "Saving…" : mode === "invite" ? "Send secure invitation" : "Grant access"}</button>{mode === "invite" ? <span className="text-xs text-[var(--muted)]">A seven-day secure link is emailed; access activates after the invited account verifies its email.</span> : null}</div>
    </form>
  </section>;
}
