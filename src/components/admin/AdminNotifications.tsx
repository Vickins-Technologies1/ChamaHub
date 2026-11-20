"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Eye, LoaderCircle, Megaphone, RefreshCw, Send } from "lucide-react";

type Row = Record<string, unknown>;
type Audience = "all_users" | "selected_users" | "selected_groups" | "group_admins" | "moderators" | "administrators";
type Preview = { recipientCount: number; emailEligible: number; sample: Array<{ userId: string; name: string | null; email: string | null }> };

function prettyDate(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)));
}

export default function AdminNotifications({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState("general");
  const [audience, setAudience] = useState<Audience>("all_users");
  const [userIds, setUserIds] = useState("");
  const [groupIds, setGroupIds] = useState("");
  const [email, setEmail] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/notifications?page=1&pageSize=100", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load announcements.");
      setRows(result.items ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load announcements."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refresh]);

  const audienceValue = () => ({
    type: audience,
    ...(audience === "selected_users" ? { userIds: userIds.split(/[\s,;]+/).filter(Boolean) } : {}),
    ...(audience === "selected_groups" || audience === "group_admins" ? { groupIds: groupIds.split(/[\s,;]+/).filter(Boolean) } : {}),
  });
  const channels = email ? ["in_app", "email"] : ["in_app"];
  const send = async (action: string) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: id || undefined, title: title.trim(), message: body.trim(), type, audience: audienceValue(), channels, ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString() } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save this notification.");
      if (action === "preview") { setPreview(result as Preview); return; }
      setMessage(result.delivery ? "Published. In-app records were inserted for " + String(result.delivery.inAppInserted) + " recipients; " + String(result.delivery.pending ?? 0) + " remain queued. Email status counts distinguish SMTP acceptance from confirmed delivery." : result.status === "scheduled" ? "Scheduled notification created." : result.status === "draft" || action === "update-draft" ? "Draft saved." : "Notification updated.");
      if (action === "create-draft" || action === "publish") reset();
      setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this notification."); }
    finally { setSaving(false); }
  };
  const reset = () => { setId(""); setTitle(""); setBody(""); setType("general"); setAudience("all_users"); setUserIds(""); setGroupIds(""); setEmail(false); setScheduledFor(""); setPreview(null); };
  const edit = (row: Row) => {
    setId(String(row.id)); setTitle(String(row.title)); setBody(String(row.message)); setType(String(row.type));
    const target = row.audience as Row;
    setAudience(String(target.type) as Audience);
    setUserIds(Array.isArray(target.userIds) ? target.userIds.join(", ") : "");
    setGroupIds(Array.isArray(target.groupIds) ? target.groupIds.join(", ") : "");
    setEmail(Array.isArray(row.channels) && row.channels.includes("email"));
    setScheduledFor("");
    setPreview(null);
  };
  const archive = async (row: Row) => {
    const response = await fetch("/api/admin/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", id: row.id }) });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Unable to archive notification.");
    else setRefresh((value) => value + 1);
  };

  return <div className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Communications</p><div className="mt-1 flex items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">Notification centre</h2><p className="mt-1 text-sm text-[var(--muted)]">Publish announcements to validated platform audiences, with recipient-level delivery records.</p></div><button className="dash-icon-btn" onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh notifications"><RefreshCw size={15} /></button></div></header>
    {error ? <div role="alert" className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</div> : null}
    {message ? <div className="rounded-lg border border-emerald-300/50 p-3 text-sm text-emerald-700">{message}</div> : null}
    {canWrite ? <section className="glass-panel space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3"><Megaphone size={18} className="mt-1 text-[var(--button-bg)]" /><div><h3 className="font-semibold">{id ? "Edit notification draft" : "Create announcement"}</h3><p className="mt-1 text-xs text-[var(--muted)]">Preview validates the current audience and reports the actual recipient count before publishing.</p></div></div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs text-[var(--muted)]">Title<input className="glass-input mt-1 !min-h-10 !py-2" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="text-xs text-[var(--muted)]">Notification type<select className="glass-input mt-1 !min-h-10 !py-2" value={type} onChange={(event) => setType(event.target.value)}>{["general", "maintenance", "security", "feature", "account", "group"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs text-[var(--muted)]">Target audience<select className="glass-input mt-1 !min-h-10 !py-2" value={audience} onChange={(event) => { setAudience(event.target.value as Audience); setPreview(null); }}>{[["all_users", "All users"], ["selected_users", "Selected users"], ["selected_groups", "Selected groups"], ["group_admins", "Group administrators"], ["moderators", "Moderators"], ["administrators", "Platform staff"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {audience === "selected_users" ? <label className="block text-xs text-[var(--muted)]">User account IDs (comma or space separated)<textarea className="glass-input mt-1 min-h-16" value={userIds} onChange={(event) => { setUserIds(event.target.value); setPreview(null); }} /></label> : null}
      {audience === "selected_groups" || audience === "group_admins" ? <label className="block text-xs text-[var(--muted)]">Group IDs (comma or space separated)<textarea className="glass-input mt-1 min-h-16" value={groupIds} onChange={(event) => { setGroupIds(event.target.value); setPreview(null); }} /></label> : null}
      <label className="block text-xs text-[var(--muted)]">Message<textarea className="glass-input mt-1 min-h-32" maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-4 text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked disabled />In-app notification</label><label className="flex items-center gap-2"><input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} />Also send email</label><label className="flex items-center gap-2">Schedule (optional)<input type="datetime-local" className="glass-input !min-h-9 !w-auto !py-1.5" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label></div>
      <div className="flex flex-wrap gap-2"><button disabled={saving} className="dashboard-export-button" onClick={() => void send("preview")}><Eye size={14} />Preview audience</button><button disabled={saving} className="dashboard-export-button" onClick={() => void send(id ? "update-draft" : "create-draft")}>Save draft</button>{!id ? <button disabled={saving} className="dashboard-export-button" onClick={() => void send("publish")}><Send size={14} />{scheduledFor ? "Schedule notification" : "Publish now"}</button> : <button className="dashboard-export-button" onClick={reset}>Cancel edit</button>}</div>
      {preview ? <div className="rounded-xl border border-[var(--dash-border)] p-4"><h4 className="text-sm font-semibold">Preview · {preview.recipientCount.toLocaleString()} recipients</h4><p className="mt-1 text-xs text-[var(--muted)]">{preview.emailEligible.toLocaleString()} have an email address; email submissions will be reported as SMTP accepted or failed, not as inbox delivery.</p><ul className="mt-2 text-xs">{preview.sample.map((item) => <li key={item.userId}>{item.name ?? "Unnamed account"} · {item.email ?? "No email"}</li>)}</ul></div> : null}
    </section> : null}
    <section className="glass-panel overflow-hidden"><div className="flex items-center gap-2 border-b border-[var(--dash-border)] p-4"><Bell size={16} className="text-[var(--button-bg)]" /><h3 className="font-semibold">Announcement history</h3></div>{loading ? <p className="p-6 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading announcements…</p> : <div className="overflow-x-auto"><table className="dashboard-table min-w-[1000px] w-full text-left"><thead><tr><th>Announcement</th><th>Audience</th><th>Channels</th><th>Status</th><th>Delivery record</th><th>Created / scheduled</th><th></th></tr></thead><tbody>{rows.map((row) => { const summary = row.deliverySummary as Row | null; const audienceRow = row.audience as Row; return <tr key={String(row.id)}><td><p className="font-medium">{String(row.title)}</p><p className="mt-1 max-w-64 truncate text-xs text-[var(--muted)]">{String(row.message)}</p></td><td>{String(audienceRow.type)}</td><td>{Array.isArray(row.channels) ? row.channels.join(", ") : "in_app"}</td><td className="capitalize">{String(row.status)}</td><td>{summary ? "In-app records " + String(summary.inAppInserted ?? 0) + " / " + String(summary.recipients ?? 0) + " · pending " + String(summary.pending ?? 0) + " · SMTP accepted " + String(summary.emailAcceptedBySmtp ?? 0) + " · email failed " + String(summary.emailFailed ?? 0) + " · email unavailable " + String(summary.emailUnavailable ?? 0) + " · outcome unknown " + String(summary.emailOutcomeUnknown ?? 0) + " · " + (row.deliveryComplete ? "complete" : "in progress") : "No delivery attempt recorded"}</td><td>{String(row.status) === "scheduled" ? prettyDate(row.scheduledFor) : prettyDate(row.createdAt)}</td><td>{row.status === "draft" && canWrite ? <button className="dashboard-export-button !px-2" onClick={() => edit(row)}>Edit draft</button> : null}{row.status !== "archived" && canWrite ? <button className="ml-2 text-xs text-rose-600" onClick={() => void archive(row)}>Archive</button> : null}</td></tr>; })}{rows.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-sm text-[var(--muted)]">No announcements have been created.</td></tr> : null}</tbody></table></div>}</section>
  </div>;
}
