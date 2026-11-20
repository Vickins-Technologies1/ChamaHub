"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, LoaderCircle } from "lucide-react";

type Notification = { id: string; title: string; message: string; type: string; createdAt: string; readAt: string | null; inAppStatus: string; emailStatus: string };
function when(value: string) { return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/chama/notifications?page=1&pageSize=100", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load notifications.");
      setItems(result.items ?? []); setUnread(result.unread ?? 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load notifications."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const markRead = async (id: string) => {
    const response = await fetch("/api/chama/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "read" }) });
    if (!response.ok) { setError("Unable to update notification status."); return; }
    setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnread((value) => Math.max(0, value - 1));
  };
  return <div className="mx-auto max-w-4xl space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Your workspace</p><div className="mt-1 flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Notifications</h1><p className="mt-1 text-sm text-[var(--muted)]">{unread} unread notification{unread === 1 ? "" : "s"}</p></div><Bell size={19} className="text-[var(--button-bg)]" /></div></header>
    {error ? <p role="alert" className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</p> : null}
    {loading ? <div className="glass-panel p-8 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Loading notifications…</div> : null}
    {!loading && items.length === 0 ? <div className="glass-panel p-10 text-center text-sm text-[var(--muted)]">No platform notifications yet.</div> : null}
    <div className="space-y-3">{items.map((item) => <article key={item.id} className={item.readAt ? "glass-panel p-4" : "glass-panel border-l-4 border-l-[var(--button-bg)] p-4"}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><span className="rounded-full bg-[var(--dash-sidebar-hover)] px-2 py-1 text-[10px] font-semibold uppercase">{item.type}</span>{!item.readAt ? <span className="text-[10px] font-semibold text-[var(--button-bg)]">Unread</span> : null}</div><h2 className="mt-2 font-semibold">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{item.message}</p><p className="mt-3 text-[10px] text-[var(--muted)]">{when(item.createdAt)} · Email: {item.emailStatus.replaceAll("_", " ")}</p></div>{!item.readAt ? <button className="dashboard-export-button shrink-0" onClick={() => void markRead(item.id)}><CheckCheck size={14} />Mark read</button> : null}</div></article>)}</div>
  </div>;
}
