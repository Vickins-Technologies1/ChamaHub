"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Plus,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";

type DashboardSummary = {
  activeGroups: number;
  nextContribution?: { dueDate: string; groupName: string } | null;
  nextPayout?: { dueDate: string; groupName: string } | null;
};

type GroupSummary = {
  id: string;
  name: string;
  contributionAmount: number;
  frequency: string;
  currency: string;
  role: string;
  status: string;
  membersCount: number;
  openRound?: {
    id: string;
    roundNumber: number;
    recipientMemberId: string;
    dueDate?: string;
    totalContributions: number;
    potAmount: number;
  } | null;
};

type RecentActivity = {
  id: string;
  groupId: string;
  groupName: string;
  memberName: string;
  amount: number;
  currency: string;
  status: "paid" | "pending";
  paidAt?: string;
};

const formatDate = (value?: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  value ? new Date(value).toLocaleDateString("en-KE", options) : "Date not set";

const formatCurrency = (amount: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

function daysUntil(value?: string) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function dueLabel(value?: string) {
  const days = daysUntil(value);
  if (days === null) return "Date not set";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export default function ChamaDashboardPage() {
  const { data: session } = authClient.useSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const roles = (session?.user?.role ?? "").split(",").map((value: string) => value.trim());
  const canManageGroups = roles.includes("moderator") || roles.includes("admin");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chama/dashboard", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to load dashboard.");
      setSummary(data.summary ?? null);
      setGroups(data.groups ?? []);
      setActivity(data.activity ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const rounds = useMemo(
    () => groups
      .filter((group) => group.openRound)
      .map((group) => ({ ...group, dueAt: group.openRound?.dueDate }))
      .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY) - (b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY)),
    [groups]
  );

  const dueSoonCount = rounds.filter((group) => {
    const days = daysUntil(group.dueAt);
    return days !== null && days >= 0 && days <= 7;
  }).length;

  const activeMemberships = groups.reduce((total, group) => total + (group.membersCount || 0), 0);
  const today = new Intl.DateTimeFormat("en-KE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] || "there";

  if (loading) {
    return (
      <div className="space-y-5" aria-label="Loading dashboard">
        <div className="dashboard-hero h-44 shimmer-line rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="glass-panel h-28 shimmer-line" />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.45fr_.9fr]">
          <div className="glass-panel h-80 shimmer-line" />
          <div className="glass-panel h-80 shimmer-line" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="dashboard-hero relative overflow-hidden rounded-2xl px-5 py-6 text-white sm:px-7 sm:py-7">
        <div className="dashboard-hero__orb" aria-hidden="true" />
        <div className="relative z-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="dashboard-hero__eyebrow">Your group. One financial pulse.</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">
              Good day, {firstName}.
            </h2>
            <p className="mt-1 text-sm text-white/70">A clear view of your groups and what is coming up.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="dashboard-hero__date">{today}</span>
            <Link href={canManageGroups ? "/chama/groups" : "/chama/ledger"} className="dashboard-hero__action">
              {canManageGroups ? <><Plus size={16} /> Create group</> : <><WalletCards size={16} /> View contributions</>}
            </Link>
          </div>
        </div>
      </section>

      {error ? <div className="glass-panel border-rose-200 p-4 text-sm text-rose-600" role="alert">{error}</div> : null}

      <section aria-label="Workspace summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Active groups", value: summary?.activeGroups ?? groups.length, detail: "Groups you belong to", icon: UsersRound, tone: "blue" },
          { label: "Open rounds", value: rounds.length, detail: "Contribution cycles underway", icon: CircleDollarSign, tone: "cyan" },
          { label: "Due in 7 days", value: dueSoonCount, detail: "Across your active groups", icon: CalendarClock, tone: "amber" },
          { label: "Active member seats", value: activeMemberships, detail: "Across these groups", icon: WalletCards, tone: "slate" },
        ].map((stat) => (
          <article className="glass-panel dashboard-stat p-4 sm:p-5" key={stat.label}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="dashboard-stat__label">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">{stat.value}</p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">{stat.detail}</p>
              </div>
              <span className={`dashboard-stat__icon dashboard-stat__icon--${stat.tone}`}><stat.icon size={18} strokeWidth={1.8} /></span>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.9fr]">
        <article className="glass-panel overflow-hidden">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-section-kicker">Current cycle</p>
              <h3 className="dashboard-section-title">Collection progress</h3>
            </div>
            <Link href="/chama/ledger" className="dashboard-text-link">Open ledger <ArrowRight size={15} /></Link>
          </div>
          {rounds.length === 0 ? (
            <div className="dashboard-empty m-4 sm:m-5"><CheckCircle2 size={18} /><span>No open contribution rounds at the moment.</span></div>
          ) : (
            <div className="divide-y divide-[var(--glass-border)]">
              {rounds.slice(0, 5).map((group) => {
                const collected = group.openRound?.totalContributions ?? 0;
                const target = group.openRound?.potAmount ?? 0;
                const progress = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
                return (
                  <Link key={group.id} href={`/chama/groups/${group.id}`} className="dashboard-progress-row">
                    <div className="flex min-w-0 items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{group.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">Round {group.openRound?.roundNumber} · {group.frequency}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{progress}%</span>
                    </div>
                    <div className="dashboard-progress-track mt-3"><span style={{ width: `${progress}%` }} /></div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                      <span>{formatCurrency(collected, group.currency)} collected</span>
                      <span>Target {formatCurrency(target, group.currency)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </article>

        <article className="glass-panel overflow-hidden">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-section-kicker">Round schedule</p>
              <h3 className="dashboard-section-title">Next contribution dates</h3>
            </div>
            <span className="dashboard-count-badge">{rounds.length}</span>
          </div>
          {rounds.length === 0 ? (
            <div className="dashboard-empty m-4 sm:m-5"><CalendarClock size={18} /><span>New round dates will appear here.</span></div>
          ) : (
            <div className="divide-y divide-[var(--glass-border)]">
              {rounds.slice(0, 5).map((group) => {
                const days = daysUntil(group.dueAt);
                const statusClass = days !== null && days < 0 ? "is-overdue" : days !== null && days <= 7 ? "is-due-soon" : "";
                return (
                  <Link href={`/chama/groups/${group.id}`} key={group.id} className="dashboard-schedule-row">
                    <span className="dashboard-date-tile"><span>{formatDate(group.dueAt, { month: "short" }).toUpperCase()}</span><strong>{group.dueAt ? new Date(group.dueAt).getDate() : "—"}</strong></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{group.name}</span><span className="mt-1 block text-xs text-[var(--muted)]">Round {group.openRound?.roundNumber}</span></span>
                    <span className={`dashboard-status ${statusClass}`}>{dueLabel(group.dueAt)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_.9fr]">
        <article className="glass-panel overflow-hidden">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-section-kicker">Your groups</p>
              <h3 className="dashboard-section-title">Group performance</h3>
            </div>
            <Link href="/chama/groups" className="dashboard-text-link">All groups <ArrowRight size={15} /></Link>
          </div>
          {groups.length === 0 ? (
            <div className="dashboard-empty m-4 sm:m-5"><UsersRound size={18} /><span>No groups are linked to your account yet.</span></div>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              {groups.slice(0, 4).map((group) => (
                <Link href={`/chama/groups/${group.id}`} key={group.id} className="dashboard-group-card">
                  <div className="flex items-start justify-between gap-3">
                    <span className="dashboard-group-avatar">{group.name.slice(0, 1).toUpperCase()}</span>
                    <span className="dashboard-role-badge">{group.role}</span>
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold">{group.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{group.membersCount} members · {group.frequency}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--glass-border)] pt-3 text-xs">
                    <span className="text-[var(--muted)]">Contribution</span>
                    <span className="font-semibold">{formatCurrency(group.contributionAmount, group.currency)}</span>
                  </div>
                  <span className="dashboard-group-open">View group <ArrowUpRight size={14} /></span>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="glass-panel overflow-hidden">
          <div className="dashboard-panel-heading">
            <div>
              <p className="dashboard-section-kicker">Payment records</p>
              <h3 className="dashboard-section-title">Recent contributions</h3>
            </div>
            <Link href="/chama/ledger" className="dashboard-text-link">View all <ArrowRight size={15} /></Link>
          </div>
          {activity.length === 0 ? (
            <div className="dashboard-empty m-4 sm:m-5"><Clock3 size={18} /><span>Recorded payments will show here when available.</span></div>
          ) : (
            <div className="divide-y divide-[var(--glass-border)]">
              {activity.slice(0, 6).map((item) => (
                <Link href={`/chama/groups/${item.groupId}`} key={item.id} className="dashboard-activity-row">
                  <span className={`dashboard-activity-icon ${item.status === "paid" ? "is-paid" : "is-pending"}`}>
                    {item.status === "paid" ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.memberName}</span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted)]">{item.groupName} · {formatDate(item.paidAt, { month: "short", day: "numeric", year: "numeric" })}</span>
                  </span>
                  <span className="shrink-0 text-right"><span className="block text-sm font-semibold tabular-nums">{formatCurrency(item.amount, item.currency)}</span><span className={`mt-1 block text-[10px] font-semibold uppercase tracking-wide ${item.status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>{item.status}</span></span>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>

      {canManageGroups && groups.length === 0 ? (
        <div className="dashboard-create-hint">
          <div><p className="text-sm font-semibold">Set up your first group</p><p className="mt-1 text-xs text-[var(--muted)]">Start a chama and invite members to begin tracking contributions.</p></div>
          <Link href="/chama/groups" className="dashboard-text-link">Create group <ArrowRight size={15} /></Link>
        </div>
      ) : null}
    </div>
  );
}
