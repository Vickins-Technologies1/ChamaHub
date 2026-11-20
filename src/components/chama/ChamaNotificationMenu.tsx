"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

type DashboardNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
  readAt: string | null;
};

const formatNotificationDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export default function ChamaNotificationMenu({ enabled }: { enabled: boolean }) {
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chama/notifications?page=1&pageSize=5", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load notifications.");
      setNotifications(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void loadNotifications();
  }, [enabled, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const markRead = async (id: string) => {
    setMarkingReadId(id);
    setError("");
    try {
      const response = await fetch("/api/chama/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "read" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update notification status.");
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
      if (data.updated) setUnread((current) => Math.max(0, current - 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update notification status.");
    } finally {
      setMarkingReadId(null);
    }
  };

  if (!enabled) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(true);
          if (!loading) void loadNotifications();
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-card-bg)] text-[var(--foreground)] transition hover:bg-[var(--dash-sidebar-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--button-bg)]"
      >
        <Bell size={18} />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[var(--dash-card-bg)]">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/35 px-4 pt-24 sm:pt-28"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="chama-notifications-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--dash-card-bg)] text-[var(--foreground)] shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 py-3">
              <div>
                <h2 id="chama-notifications-title" className="font-semibold">Notifications</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{unread} unread</p>
              </div>
              <button ref={closeRef} type="button" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--dash-sidebar-hover)]" aria-label="Close notifications">Close</button>
            </header>
            {error ? <p role="alert" className="mx-4 mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p> : null}
            <div className="max-h-[min(60vh,24rem)] overflow-y-auto divide-y divide-[var(--glass-border)]">
              {loading ? <p className="p-6 text-center text-sm text-[var(--muted)]">Loading notifications…</p> : null}
              {!loading && notifications.length === 0 ? <p className="p-6 text-center text-sm text-[var(--muted)]">You’re all caught up.</p> : null}
              {notifications.map((item) => (
                <article key={item.id} className={`px-4 py-3 ${item.readAt ? "" : "bg-blue-50/60 dark:bg-blue-950/30"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-slate-200" : "bg-blue-600"}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted)]">{item.message}</p>
                      <p className="mt-2 text-[10px] text-[var(--muted)]">{formatNotificationDate(item.createdAt)}</p>
                    </div>
                    {!item.readAt ? (
                      <button
                        type="button"
                        onClick={() => void markRead(item.id)}
                        disabled={markingReadId === item.id}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--button-bg)] hover:bg-blue-100 disabled:opacity-50 dark:hover:bg-blue-950"
                      >
                        <CheckCheck size={13} /> {markingReadId === item.id ? "Saving" : "Read"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            <footer className="border-t border-[var(--glass-border)] px-4 py-3 text-right">
              <Link href="/chama/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-[var(--button-bg)] hover:underline">View all notifications</Link>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

