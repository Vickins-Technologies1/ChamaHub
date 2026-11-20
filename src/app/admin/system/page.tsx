"use client";

import { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, CircleOff, LoaderCircle } from "lucide-react";

type Item = { status: string; [key: string]: unknown };
type SystemInfo = { checkedAt: string; services: Record<string, Item>; capabilities: Record<string, string> };

export default function SystemPage() {
  const [data, setData] = useState<SystemInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/admin/system", { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to check system status."); setData(result as SystemInfo); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to check system status.")); }, []);

  return <div className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Operations</p><h2 className="mt-1 text-2xl font-semibold">System status</h2><p className="mt-1 text-sm text-[var(--muted)]">Read-only checks for current integrations and backend availability. Secret values are never returned.</p></div>
    {error ? <div className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</div> : null}
    {!data && !error ? <div className="glass-panel flex h-40 items-center justify-center text-sm text-[var(--muted)]"><LoaderCircle size={16} className="mr-2 animate-spin" />Checking service status…</div> : null}
    {data ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(data.services).map(([name, service]) => { const status = service.status; const ok = status === "connected" || status === "running" || status === "configured"; const down = status === "unavailable" || status === "incomplete"; const Icon = ok ? CheckCircle2 : down ? AlertCircle : CircleOff; return <article key={name} className="glass-panel p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold capitalize">{name.replace(/([A-Z])/g, " $1")}</p><Icon size={17} className={ok ? "text-emerald-600" : down ? "text-rose-500" : "text-amber-500"} /></div><p className="mt-3 text-lg font-semibold capitalize">{status}</p><div className="mt-2 space-y-1 text-xs text-[var(--muted)]">{Object.entries(service).filter(([key]) => key !== "status").map(([key, value]) => <p key={key}><span className="capitalize">{key.replace(/([A-Z])/g, " $1")}: </span>{Array.isArray(value) ? value.join(", ") || "None" : String(value)}</p>)}</div></article>; })}</div>
      <section className="glass-panel p-5"><div className="flex items-center gap-2"><Activity size={16} className="text-[var(--button-bg)]" /><h3 className="font-semibold">Platform capabilities</h3></div><div className="mt-4 divide-y divide-[var(--dash-border)]">{Object.entries(data.capabilities).map(([key, value]) => <div key={key} className="flex flex-col justify-between gap-2 py-3 text-sm sm:flex-row"><span className="font-medium capitalize">{key.replace(/([A-Z])/g, " $1")}</span><span className="text-xs text-[var(--muted)]">{value}</span></div>)}</div><p className="mt-3 text-[10px] text-[var(--muted)]">Status checked {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.checkedAt))}</p></section>
      <p className="px-1 text-xs text-[var(--muted)]">M-Pesa credentials are not wired to a live initiation or callback flow; a ready-looking environment does not mark any transaction as verified.</p>
    </> : null}</div>;
}
