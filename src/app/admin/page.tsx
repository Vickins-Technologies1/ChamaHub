"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Banknote, CalendarDays, CircleDollarSign, Layers3, RefreshCw, ShieldAlert, Users, UsersRound } from "lucide-react";
import { formatMinorUnits } from "@/lib/finance/money";

type DashboardData = {
  metrics: {
    totalUsers: number; newUsers: number; newUsersChangePercent: number | null; suspendedUsers: number;
    totalGroups: number; activeGroups: number; archivedGroups: number; newGroups: number; newGroupsChangePercent: number | null;
    totalMembers: number; activeMembers: number; openRounds: number; activeUsers: null;
  };
  financial: {
    contributions: Array<{ currency: string; status: string; count: number; amountMinor: number }>;
    payouts: Array<{ currency: string; status: string; count: number; amountMinor: number }>;
  };
  trends: {
    registrations: Array<{ _id: string; count: number }>;
    groups: Array<{ _id: string; count: number }>;
    transactions: Array<{ _id: { day: string; type: string }; count: number }>;
  };
  activity: Array<{ id: string; kind: string; title: string; detail: string; occurredAt: string | null }>;
  dataAvailability: { subscriptions: boolean; supportTickets: boolean; loginHistory: boolean; paymentGateway: boolean };
};

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function TrendChart({ data }: { data: DashboardData["trends"] }) {
  const days = useMemo(() => {
    const keys = new Set<string>();
    data.registrations.forEach((item) => keys.add(item._id));
    data.groups.forEach((item) => keys.add(item._id));
    data.transactions.forEach((item) => keys.add(item._id.day));
    return [...keys].sort();
  }, [data]);
  const sets = [
    { key: "registrations", label: "Registrations", color: "#1b5cff", values: new Map(data.registrations.map((item) => [item._id, item.count])) },
    { key: "groups", label: "Groups", color: "#20a88b", values: new Map(data.groups.map((item) => [item._id, item.count])) },
    { key: "transactions", label: "Ledger entries", color: "#e09933", values: new Map(data.transactions.reduce<Map<string, number>>((map, item) => map.set(item._id.day, (map.get(item._id.day) ?? 0) + item.count), new Map())) },
  ];
  const width = 760;
  const height = 190;
  const max = Math.max(1, ...sets.flatMap((set) => days.map((day) => set.values.get(day) ?? 0)));
  const points = (set: (typeof sets)[number]) => days.map((day, index) => {
    const x = days.length <= 1 ? width / 2 : 18 + index * (width - 36) / (days.length - 1);
    const y = height - 16 - ((set.values.get(day) ?? 0) / max) * (height - 32);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
        {sets.map((set) => <span key={set.key} className="inline-flex items-center gap-2 text-xs text-[var(--muted)]"><span className="h-2 w-2 rounded-full" style={{ background: set.color }} />{set.label}</span>)}
      </div>
      {days.length === 0 ? <div className="flex h-48 items-center justify-center text-sm text-[var(--muted)]">No records in this period.</div> : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Platform activity trend chart" className="h-48 w-full overflow-visible">
          {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={18 + line * 50} y2={18 + line * 50} stroke="var(--dash-border)" strokeDasharray="3 5" />)}
          {sets.map((set) => <polyline key={set.key} points={points(set)} fill="none" stroke={set.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
      )}
      {days.length > 1 ? <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]"><span>{days[0]}</span><span>{days[Math.floor(days.length / 2)]}</span><span>{days.at(-1)}</span></div> : null}
    </div>
  );
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-[var(--muted)]">No prior period data</span>;
  const positive = value >= 0;
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${positive ? "text-emerald-600" : "text-rose-500"}`}>{positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(value)}% vs prior period</span>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [to, setTo] = useState(() => localDate(new Date()));
  const [from, setFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 29); return localDate(date); });

  const load = useCallback(async (silent = false) => {
    setError("");
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const toExclusive = new Date(`${to}T00:00:00`);
      toExclusive.setDate(toExclusive.getDate() + 1);
      const query = new URLSearchParams({ from: new Date(`${from}T00:00:00`).toISOString(), to: toExclusive.toISOString() });
      const response = await fetch(`/api/admin/dashboard?${query.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to load platform analytics.");
      setData(result as DashboardData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load platform analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const cards = data ? [
    { label: "Registered users", value: data.metrics.totalUsers.toLocaleString(), detail: `${data.metrics.newUsers.toLocaleString()} joined in range`, change: data.metrics.newUsersChangePercent, icon: Users },
    { label: "Savings groups", value: data.metrics.totalGroups.toLocaleString(), detail: `${data.metrics.activeGroups} active · ${data.metrics.archivedGroups} archived`, change: data.metrics.newGroupsChangePercent, icon: UsersRound },
    { label: "Group members", value: data.metrics.totalMembers.toLocaleString(), detail: `${data.metrics.activeMembers.toLocaleString()} active memberships`, icon: Layers3 },
    { label: "Open rounds", value: data.metrics.openRounds.toLocaleString(), detail: "Across registered groups", icon: CalendarDays },
    { label: "Suspended accounts", value: data.metrics.suspendedUsers.toLocaleString(), detail: "Accounts marked suspended", icon: ShieldAlert },
    { label: "Monthly active users", value: "Not tracked", detail: "Login history is not stored", icon: Activity },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Platform overview</p><h2 className="mt-1 text-2xl font-semibold">Good operations start with clear signals.</h2><p className="mt-1 text-sm text-[var(--muted)]">Live counts from ChamaPulse accounts, group records, and the verified financial ledger.</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-[var(--muted)]">From<input aria-label="From date" className="glass-input mt-1 !min-h-9 !py-1.5" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="text-xs text-[var(--muted)]">To<input aria-label="To date" className="glass-input mt-1 !min-h-9 !py-1.5" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="button" onClick={() => void load(true)} disabled={refreshing || loading} className="dash-icon-btn" aria-label="Refresh dashboard"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {error ? <div className="glass-panel border border-rose-300/50 p-4 text-sm text-rose-600">{error}</div> : null}
      {loading && !data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2,3,4,5].map((item) => <div key={item} className="glass-panel h-28 animate-pulse" />)}</div> : null}
      {data ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => <article key={card.label} className="glass-panel dash-card p-4">
            <div className="flex items-start justify-between"><p className="text-xs font-semibold text-[var(--muted)]">{card.label}</p><card.icon size={17} className="text-[var(--button-bg)]" /></div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{card.value}</p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-[var(--muted)]">{card.detail}</span>{card.change !== undefined ? <Change value={card.change} /> : null}</div>
          </article>)}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
          <article className="glass-panel p-5">
            <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="font-semibold">Platform activity</h3><p className="mt-1 text-xs text-[var(--muted)]">Daily registrations, group creation, and financial records.</p></div><span className="rounded-lg border border-[var(--dash-border)] px-2.5 py-1 text-[10px] text-[var(--muted)]">UTC dates</span></div>
            <TrendChart data={data.trends} />
          </article>
          <article className="glass-panel p-5">
            <div className="mb-4 flex items-start justify-between"><div><h3 className="font-semibold">Financial activity</h3><p className="mt-1 text-xs text-[var(--muted)]">Ledger records within the selected period.</p></div><CircleDollarSign size={18} className="text-[var(--button-bg)]" /></div>
            {([ ["Contributions", data.financial.contributions], ["Payouts", data.financial.payouts] ] as const).map(([label, rows]) => <div key={label} className="mb-4 last:mb-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</p>
              {rows.length ? <div className="space-y-2">{rows.map((row) => <div key={`${row.currency}-${row.status}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--dash-border)] px-3 py-2"><span className="min-w-0"><span className="block text-sm font-medium">{formatMinorUnits(row.amountMinor, row.currency)}</span><span className="text-[11px] text-[var(--muted)]">{row.currency} · {row.count} entries · {row.status.replaceAll("_", " ")}</span></span><Banknote size={15} className="shrink-0 text-[var(--muted)]" /></div>)}</div> : <p className="text-sm text-[var(--muted)]">No {label.toLowerCase()} in this period.</p>}
            </div>)}
            <a className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[var(--button-bg)]" href="/admin/finance">Open transaction ledger <ArrowUpRight size={14} /></a>
          </article>
        </section>

        <section className="glass-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--dash-border)] px-5 py-4"><div><h3 className="font-semibold">Recent platform activity</h3><p className="mt-1 text-xs text-[var(--muted)]">Latest registrations, groups, and ledger entries.</p></div><a href="/admin/audit" className="text-xs font-semibold text-[var(--button-bg)]">View admin audit</a></div>
          {data.activity.length ? <div className="divide-y divide-[var(--dash-border)]">{data.activity.map((item) => <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--dash-sidebar-hover)] text-[var(--button-bg)]">{item.kind === "transaction" ? <Banknote size={15} /> : item.kind === "group" ? <UsersRound size={15} /> : <Users size={15} />}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-[var(--muted)]">{item.detail}</p></div></div>
            <time className="shrink-0 text-xs text-[var(--muted)]">{item.occurredAt ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.occurredAt)) : "—"}</time>
          </div>)}</div> : <div className="p-8 text-center text-sm text-[var(--muted)]">No platform records yet.</div>}
        </section>

        <p className="px-1 text-xs text-[var(--muted)]">Billing, active login metrics, support tickets, and live payment gateway status are not connected to this project’s current data model. Figures above do not estimate those values.</p>
      </> : null}
    </div>
  );
}
