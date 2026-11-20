"use client";

import { useEffect, useState } from "react";
import { Eye, LoaderCircle, ShieldCheck, Wrench } from "lucide-react";

type Settings = { enabled: boolean; announcement: string; expectedRestorationAt: string | null; affectedRoutes: string[]; exemptAdmins: boolean; updatedBy: string | null; updatedAt: string | null };

export default function MaintenanceCenter({ canManage }: { canManage: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [restoration, setRestoration] = useState("");
  const [routes, setRoutes] = useState("/");
  const [exemptAdmins, setExemptAdmins] = useState(true);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/admin/maintenance", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load maintenance settings.");
      const data = result as Settings;
      setSettings(data); setAnnouncement(data.announcement); setRestoration(data.expectedRestorationAt ? new Date(data.expectedRestorationAt).toISOString().slice(0, 16) : ""); setRoutes(data.affectedRoutes.join(", ")); setExemptAdmins(data.exemptAdmins);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load maintenance settings.")).finally(() => setLoading(false));
  }, []);
  const save = async (enabled: boolean) => {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/maintenance", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, announcement, expectedRestorationAt: restoration ? new Date(restoration).toISOString() : null, affectedRoutes: routes.split(/[\s,;]+/).filter(Boolean), exemptAdmins }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update maintenance mode.");
      setSettings(result as Settings);
      setMessage(enabled ? "Maintenance mode enabled. Affected routes now receive the maintenance gate." : "Maintenance mode disabled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update maintenance mode."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="glass-panel p-8 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading maintenance controls…</div>;
  return <div className="space-y-5"><header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Platform availability</p><h2 className="mt-1 text-2xl font-semibold">Maintenance control centre</h2><p className="mt-1 text-sm text-[var(--muted)]">Server-side route gating preserves administrator access, authentication flows, background jobs and callback routes.</p></header>
    {error ? <p role="alert" className="rounded-lg border border-rose-300/50 p-3 text-sm text-rose-600">{error}</p> : null}{message ? <p className="rounded-lg border border-emerald-300/50 p-3 text-sm text-emerald-700">{message}</p> : null}
    <section className="glass-panel space-y-4 p-4 sm:p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Wrench size={18} className="text-[var(--button-bg)]" /><div><h3 className="font-semibold">Maintenance mode</h3><p className="text-xs text-[var(--muted)]">Current state: <strong className="capitalize">{settings?.enabled ? "enabled" : "disabled"}</strong></p></div></div><ShieldCheck size={17} className="text-emerald-600" /></div>
      <label className="block text-xs text-[var(--muted)]">Maintenance announcement<textarea className="glass-input mt-1 min-h-24" minLength={10} maxLength={1000} value={announcement} disabled={!canManage} onChange={(event) => setAnnouncement(event.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-[var(--muted)]">Expected restoration time<input type="datetime-local" className="glass-input mt-1 !min-h-10 !py-2" value={restoration} disabled={!canManage} onChange={(event) => setRestoration(event.target.value)} /></label><label className="text-xs text-[var(--muted)]">Affected route prefixes<input className="glass-input mt-1 !min-h-10 !py-2" value={routes} disabled={!canManage} onChange={(event) => setRoutes(event.target.value)} placeholder="/" /><span className="mt-1 block text-[10px]">Use / to affect the full platform or list selected route prefixes.</span></label></div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={exemptAdmins} disabled={!canManage} onChange={(event) => setExemptAdmins(event.target.checked)} />Allow active platform administrators through maintenance mode</label>
      <div className="flex flex-wrap gap-2">{canManage ? <button className="dashboard-export-button border-rose-300/60 text-rose-600" disabled={saving} onClick={() => { if (window.confirm("Enable server-side maintenance mode for the configured routes?")) void save(true); }}>Enable maintenance</button> : null}{canManage ? <button className="dashboard-export-button" disabled={saving} onClick={() => void save(false)}>Disable maintenance</button> : null}<button className="dashboard-export-button" onClick={() => setPreview((value) => !value)}><Eye size={14} />{preview ? "Hide preview" : "Preview page"}</button><a className="dashboard-export-button" href="/maintenance" target="_blank" rel="noreferrer">Open maintenance page</a></div>
    </section>
    {preview ? <section className="glass-panel mx-auto max-w-2xl p-8 text-center"><Wrench size={22} className="mx-auto text-[var(--button-bg)]" /><p className="mt-4 text-xs uppercase tracking-widest text-[var(--muted)]">ChamaPulse · Scheduled service work</p><h3 className="mt-2 text-2xl font-semibold">We’ll be back soon</h3><p className="mt-3 whitespace-pre-wrap text-sm text-[var(--muted)]">{announcement}</p>{restoration ? <p className="mt-3 text-xs text-[var(--muted)]">Expected restoration: {new Date(restoration).toLocaleString("en-KE")}</p> : null}</section> : null}
    <p className="text-xs text-[var(--muted)]">Last change: {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString("en-KE") + " · " + (settings.updatedBy ?? "Unknown operator") : "No maintenance setting has been changed."}</p>
  </div>;
}
