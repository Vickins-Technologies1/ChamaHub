"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";

type Data = { staff: { userId: string; name: string; email: string; role: string; permissions: string[]; status: string; expiresAt: string | null; createdAt: string | null }; metrics: Record<string, number>; activity: Array<{ id: string; actorRole: string; action: string; entityType: string; entityId: string; occurredAt: string; ipAddress: string | null; metadata: unknown }> };
export default function StaffHistoryPage({ params }: { params: Promise<{ userId: string }> }) {
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void params.then((value) => setUserId(value.userId)); }, [params]);
  useEffect(() => { if (!userId) return; void fetch("/api/admin/staff/" + encodeURIComponent(userId), { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load staff history."); setData(result as Data); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load staff history.")); }, [userId]);
  if (error) return <div className="glass-panel p-5 text-sm text-rose-600">{error}</div>;
  if (!data) return <div className="glass-panel p-8 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading staff history…</div>;
  const time = (value: string | null) => value ? new Date(value).toLocaleString("en-KE") : "—";
  return <div className="space-y-5"><Link href="/admin/staff" className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--button-bg)]"><ArrowLeft size={14} />Staff management</Link><header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Staff profile</p><h2 className="mt-1 text-2xl font-semibold">{data.staff.name || "Unnamed staff"}</h2><p className="mt-1 text-sm text-[var(--muted)]">{data.staff.email} · {data.staff.role} · {data.staff.status}</p></header>
    <section className="glass-panel p-4"><div className="flex items-center gap-2"><ShieldCheck size={16} className="text-[var(--button-bg)]" /><h3 className="font-semibold">Recorded performance</h3></div><div className="mt-3 grid gap-3 sm:grid-cols-5">{Object.entries(data.metrics).map(([key, value]) => <div key={key}><p className="text-xs capitalize text-[var(--muted)]">{key.replaceAll(/([A-Z])/g, " $1")}</p><p className="mt-1 text-xl font-semibold">{value.toLocaleString()}</p></div>)}</div><p className="mt-3 text-xs text-[var(--muted)]">Permissions: {data.staff.permissions.join(", ") || "None"} · Expiry: {time(data.staff.expiresAt)}</p></section>
    <section className="glass-panel overflow-hidden"><div className="border-b border-[var(--dash-border)] p-4"><h3 className="font-semibold">Administrative audit history</h3></div><div className="divide-y divide-[var(--dash-border)]">{data.activity.map((item) => <article key={item.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">{item.action}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.entityType} · {item.entityId} · {item.actorRole}</p><p className="mt-1 text-xs text-[var(--muted)]">{JSON.stringify(item.metadata)}</p></div><time className="text-[10px] text-[var(--muted)]">{time(item.occurredAt)}</time></article>)}{data.activity.length === 0 ? <p className="p-8 text-sm text-[var(--muted)]">No administrative actions recorded for this staff account.</p> : null}</div></section>
  </div>;
}
