"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, SlidersHorizontal } from "lucide-react";

type Flag = { key: string; name: string; description: string; enabled: boolean; lastModifiedBy: string | null; lastModifiedAt: string | null };
type History = { id: string; key: string; before: boolean; after: boolean; changedBy: string; changedAt: string };

export default function FeatureManagement({ canManage }: { canManage: boolean }) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const load = async () => {
    const response = await fetch("/api/admin/features", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load feature flags.");
    setFlags(result.flags ?? []); setHistory(result.history ?? []);
  };
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load feature flags.")).finally(() => setLoading(false)); }, []);
  const toggle = async (flag: Flag) => {
    setSaving(flag.key); setError("");
    try {
      const response = await fetch("/api/admin/features", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: flag.key, enabled: !flag.enabled }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update this feature.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update this feature."); }
    finally { setSaving(""); }
  };
  if (loading) return <div className="glass-panel p-8 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading feature configuration…</div>;
  return <div className="space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Platform configuration</p><h2 className="mt-1 text-2xl font-semibold">Feature management</h2><p className="mt-1 text-sm text-[var(--muted)]">Changes are stored in MongoDB and enforced in the server request proxy before affected write endpoints run.</p></header>
    {error ? <p role="alert" className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</p> : null}
    <section className="glass-panel overflow-hidden"><div className="flex items-center gap-2 border-b border-[var(--dash-border)] p-4"><SlidersHorizontal size={16} className="text-[var(--button-bg)]" /><h3 className="font-semibold">Global feature switches</h3></div><div className="divide-y divide-[var(--dash-border)]">{flags.map((flag) => <article key={flag.key} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-semibold">{flag.name}</h4><p className="mt-1 text-xs text-[var(--muted)]">{flag.description}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Last modified {flag.lastModifiedAt ? new Date(flag.lastModifiedAt).toLocaleString("en-KE") + " by " + flag.lastModifiedBy : "Default configuration (enabled)"}</p></div><button disabled={!canManage || saving === flag.key} onClick={() => void toggle(flag)} className={flag.enabled ? "dashboard-export-button" : "dashboard-export-button border-rose-300/60 text-rose-600"}>{saving === flag.key ? "Saving…" : flag.enabled ? "Enabled · turn off" : "Disabled · turn on"}</button></article>)}</div></section>
    <section className="glass-panel overflow-hidden"><div className="border-b border-[var(--dash-border)] p-4"><h3 className="font-semibold">Change history</h3></div><div className="overflow-x-auto"><table className="dashboard-table min-w-[700px] w-full text-left"><thead><tr><th>Feature</th><th>Previous</th><th>New</th><th>Changed by</th><th>Changed</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{item.key}</td><td>{item.before ? "Enabled" : "Disabled"}</td><td>{item.after ? "Enabled" : "Disabled"}</td><td>{item.changedBy}</td><td>{new Date(item.changedAt).toLocaleString("en-KE")}</td></tr>)}{history.length === 0 ? <tr><td colSpan={5} className="p-6 text-sm text-[var(--muted)]">No feature flag changes recorded.</td></tr> : null}</tbody></table></div></section>
    <p className="text-xs text-[var(--muted)]">All flags are global for this deployment. Per-environment overrides are not configured in the current deployment setup. Payment verification and financial validation remain enforced by the existing ledger workflows regardless of these switches.</p>
  </div>;
}
