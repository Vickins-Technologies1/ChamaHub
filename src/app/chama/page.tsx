"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Plus, Sparkles, Users, Wallet } from "lucide-react";
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
  openRound?: {
    id: string;
    roundNumber: number;
    recipientMemberId: string;
    dueDate?: string;
    totalContributions: number;
    potAmount: number;
  } | null;
};

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-KE", { month: "short", day: "numeric" }) : "—";

export default function ChamaDashboardPage() {
  const { data: session } = authClient.useSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }),
    []
  );

  const isModerator =
    session?.user?.role?.split(",").map((value: string) => value.trim()).includes("moderator") ??
    false;
  const isAdmin =
    session?.user?.role?.split(",").map((value: string) => value.trim()).includes("admin") ?? false;

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chama/dashboard", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to load dashboard.");
      setSummary(data.summary);
      setGroups(data.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const upcomingRounds = useMemo(() => {
    return groups
      .filter((group) => group.openRound?.dueDate)
      .map((group) => ({
        id: group.id,
        name: group.name,
        dueDate: new Date(group.openRound?.dueDate ?? ""),
        potAmount: group.openRound?.potAmount ?? 0,
        roundNumber: group.openRound?.roundNumber ?? 0,
      }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [groups]);

  const totalOpenPot = useMemo(
    () => upcomingRounds.reduce((sum, round) => sum + (round.potAmount || 0), 0),
    [upcomingRounds]
  );

  const dueSoonCount = useMemo(() => {
    const now = new Date();
    return upcomingRounds.filter((round) => {
      const diff = Math.ceil((round.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    }).length;
  }, [upcomingRounds]);

  const groupPulse = useMemo(() => groups.slice(0, 4), [groups]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel p-6 sm:p-8 h-40 shimmer-line" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="glass-panel p-6 h-24 shimmer-line" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="glass-panel p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(0,144,224,0.18),_transparent_55%)]" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs sm:text-sm uppercase tracking-[0.3em] text-[var(--accent)]">
              <Sparkles size={16} />
              Chama Workspace
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mt-3">
              Keep contributions on track and payouts on time.
            </h1>
            <p className="text-sm sm:text-base text-[var(--muted)] mt-3 max-w-2xl">
              A focused hub for upcoming dues, group health, and quick moderation actions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/chama/groups"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold shadow-lg hover:-translate-y-0.5 transition"
            >
              View groups
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/chama/ledger"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold"
            >
              Open ledger
              <ArrowRight size={16} />
            </Link>
            {(isModerator || isAdmin) && (
              <Link
                href="/chama/groups"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold"
              >
                <Plus size={16} />
                New group
              </Link>
            )}
          </div>
        </div>
      </section>

      {error && <div className="glass-panel p-4 text-sm text-rose-500">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: "Active groups",
            value: summary?.activeGroups ?? 0,
            icon: Users,
          },
          {
            label: "Next contribution",
            value: summary?.nextContribution
              ? `${summary.nextContribution.groupName} · ${formatDate(summary.nextContribution.dueDate)}`
              : "All clear",
            icon: Wallet,
          },
          {
            label: "Next payout",
            value: summary?.nextPayout
              ? `${summary.nextPayout.groupName} · ${formatDate(summary.nextPayout.dueDate)}`
              : "No payout soon",
            icon: CalendarCheck,
          },
          {
            label: "Open pot",
            value: totalOpenPot ? currencyFormatter.format(totalOpenPot) : "—",
            icon: Wallet,
          },
        ].map((stat) => (
          <div key={stat.label} className="glass-panel dash-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{stat.label}</p>
              <stat.icon size={18} className="text-[var(--accent)] dashboard-icon" />
            </div>
            <p className="text-lg sm:text-xl font-semibold mt-3">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="glass-panel p-6 sm:p-7 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Priority timeline</p>
              <h2 className="text-xl font-semibold mt-2">Upcoming contributions</h2>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
                Due soon
              </p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{dueSoonCount}</p>
            </div>
          </div>
          {upcomingRounds.length === 0 ? (
            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-sm text-[var(--muted)]">
              No open rounds right now. New rounds will appear here as soon as a cycle starts.
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingRounds.slice(0, 4).map((round) => (
                <div
                  key={round.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
                >
                  <div>
                    <p className="font-semibold">{round.name}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      Round {round.roundNumber} · Due {round.dueDate.toLocaleDateString("en-KE", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {currencyFormatter.format(round.potAmount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel p-6 sm:p-7 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Group pulse</p>
            <h2 className="text-xl font-semibold mt-2">Quick health check</h2>
          </div>
          {groupPulse.length === 0 ? (
            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-sm text-[var(--muted)]">
              No groups found yet. Create a new chama to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {groupPulse.map((group) => (
                <div
                  key={group.id}
                  className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{group.name}</p>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                      {group.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                    <span>{group.frequency}</span>
                    <span>{currencyFormatter.format(group.contributionAmount)}</span>
                    <span>Role: {group.role}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-[var(--muted)]">
                      Next due: {formatDate(group.openRound?.dueDate)}
                    </span>
                    <Link
                      href={`/chama/groups/${group.id}`}
                      className="text-[var(--button-bg)] font-semibold"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(isModerator || isAdmin) && (
            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-xs text-[var(--muted)]">
              Need to spin up a new chama? Create a group and invite members in minutes.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
