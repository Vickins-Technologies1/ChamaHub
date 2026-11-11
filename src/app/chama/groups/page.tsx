"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import Modal from "@/components/Modal";
import { Skeleton } from "@/components/ui/Skeleton";

type GroupMembership = {
  role: string;
  status: string;
};

type GroupSummary = {
  id: string;
  name: string;
  description?: string;
  contributionAmount: number;
  frequency: string;
  currency: string;
  startDate?: string;
  status: string;
  rotationType: string;
  currentRound: number;
  potAmount: number;
  openRound?: {
    id: string;
    roundNumber: number;
    recipientMemberId: string;
    status: string;
    dueDate?: string;
    totalContributions: number;
  } | null;
  membership?: GroupMembership | null;
  membersCount: number;
};

const inputClass =
  "glass-input";

const formatShortDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-KE", { month: "short", day: "numeric" }) : "—";

export default function ChamaGroupsPage() {
  const { data: session } = authClient.useSession();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [message, setMessage] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    contributionAmount: "",
    frequency: "monthly",
    numberOfMembers: "5",
    startDate: new Date().toISOString().slice(0, 10),
    currency: "KES",
    rotationType: "manual",
  });

  const isModerator =
    session?.user?.role?.split(",").map((value: string) => value.trim()).includes("moderator") ??
    false;
  const isAdmin =
    session?.user?.role?.split(",").map((value: string) => value.trim()).includes("admin") ?? false;

  const formatCurrency = useCallback((amount: number, currency = "KES") => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }, []);

  const loadGroups = async (options: { silent?: boolean } = {}) => {
    if (options.silent) setRefreshing(true);
    else setLoading(true);

    setError((prev) => (options.silent ? prev : ""));
    try {
      const response = await fetch("/api/chama/groups", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load groups.");
      setGroups(data.groups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load groups.");
    } finally {
      if (options.silent) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const statusOptions = useMemo(() => {
    const uniqueStatuses = Array.from(
      new Set(groups.map((group) => group.status).filter(Boolean))
    );
    return ["All", ...uniqueStatuses];
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return groups.filter((group) => {
      const matchesQuery =
        !normalizedQuery ||
        group.name.toLowerCase().includes(normalizedQuery) ||
        group.description?.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "All" || group.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [groups, query, statusFilter]);

  const openRounds = useMemo(
    () => groups.filter((group) => group.openRound?.dueDate),
    [groups]
  );

  const dueSoonCount = useMemo(() => {
    const now = new Date();
    return openRounds.filter((group) => {
      const dueDate = new Date(group.openRound?.dueDate ?? "");
      const diff = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    }).length;
  }, [openRounds]);

  const totalMembers = useMemo(
    () => groups.reduce((sum, group) => sum + (group.membersCount || 0), 0),
    [groups]
  );

  const handleCreateGroup = async () => {
    setMessage("");
    setError("");
    if (!form.name.trim() || !form.contributionAmount) {
      setError("Provide a group name and contribution amount.");
      return;
    }

    setCreatePending(true);
    try {
      const response = await fetch("/api/chama/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to create group.");
      setMessage("Group created successfully.");
      setForm((prev) => ({ ...prev, name: "", description: "" }));
      setIsCreateOpen(false);
      await loadGroups({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create group.");
    } finally {
      setCreatePending(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="glass-panel p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_55%)]" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs sm:text-sm uppercase tracking-[0.3em] text-[var(--accent-2)]">
              <ShieldCheck size={16} />
              Group Directory
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mt-3">
              Manage chama rotations, members, and dues.
            </h1>
            <p className="text-sm sm:text-base text-[var(--muted)] mt-3 max-w-2xl">
              Filter active groups, track open rounds, and launch new savings cycles fast.
            </p>
          </div>
          {(isModerator || isAdmin) && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold shadow-lg hover:-translate-y-0.5 transition"
            >
              <Plus size={16} />
              Create group
            </button>
          )}
        </div>
      </section>

      {error && <div className="glass-panel p-4 text-sm text-rose-500">{error}</div>}
      {message && <div className="glass-panel p-4 text-sm text-[var(--foreground)]">{message}</div>}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total groups", value: groups.length, icon: Users },
          { label: "Active members", value: totalMembers, icon: Users },
          { label: "Open rounds", value: openRounds.length, icon: CalendarCheck },
          { label: "Due this week", value: dueSoonCount, icon: Wallet },
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

      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search groups or descriptions"
              className="w-full rounded-full border border-[var(--glass-border)] bg-white/70 py-2 pl-10 pr-4 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold border transition ${
                  statusFilter === status
                    ? "bg-[var(--button-bg)] text-white border-transparent"
                    : "border-[var(--glass-border)] bg-white/70 text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="space-y-4">
          {loading && groups.length === 0 ? (
            <div className="space-y-4">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="glass-panel p-5 sm:p-6 border border-[var(--glass-border)]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Skeleton variant="line" className="h-5 w-44" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-6 w-24 rounded-full" />
                      </div>
                      <Skeleton variant="line" className="h-4 w-5/6" />
                      <div className="flex flex-wrap gap-3">
                        <Skeleton variant="line" className="h-3 w-20" />
                        <Skeleton variant="line" className="h-3 w-16" />
                        <Skeleton variant="line" className="h-3 w-28" />
                        <Skeleton variant="line" className="h-3 w-16" />
                      </div>
                    </div>
                    <div className="space-y-2 sm:text-right">
                      <Skeleton variant="line" className="h-4 w-28 sm:ml-auto" />
                      <Skeleton variant="line" className="h-3 w-24 sm:ml-auto" />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3">
                      <Skeleton variant="line" className="h-3 w-20" />
                      <Skeleton variant="line" className="h-3 w-24" />
                      <Skeleton variant="line" className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-9 w-28 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="glass-panel p-6 sm:p-8 text-sm text-[var(--muted)]">
              No groups match your filters yet.
            </div>
          ) : (
            filteredGroups.map((group) => {
              const dueDate = group.openRound?.dueDate
                ? new Date(group.openRound?.dueDate)
                : null;
              const daysToDue = dueDate
                ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;
              const urgencyLabel =
                daysToDue === null
                  ? "No round"
                  : daysToDue < 0
                  ? "Overdue"
                  : daysToDue <= 7
                  ? "Due soon"
                  : "On track";
              const roleLabel =
                group.membership?.role ?? (isAdmin ? "admin" : isModerator ? "moderator" : "member");
              return (
                <div
                  key={group.id}
                  className="glass-panel p-5 sm:p-6 border border-[var(--glass-border)]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold">{group.name}</h3>
                        <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.2em] bg-white/70 text-[var(--muted)]">
                          {group.status}
                        </span>
                        <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.2em] bg-[var(--button-bg)]/10 text-[var(--button-bg)]">
                          {urgencyLabel}
                        </span>
                      </div>
                      {group.description && (
                        <p className="text-sm text-[var(--muted)] mt-2">{group.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                        <span>{group.membersCount} members</span>
                        <span>{group.frequency}</span>
                        <span>Rotation: {group.rotationType}</span>
                        <span>Round {group.currentRound}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {formatCurrency(group.contributionAmount, group.currency)}
                      </p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Pot: {formatCurrency(group.potAmount, group.currency)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                      <span>Role: {roleLabel}</span>
                      <span>Status: {group.membership?.status ?? "active"}</span>
                      <span>Next due: {formatShortDate(group.openRound?.dueDate)}</span>
                    </div>
                    <Link
                      href={`/chama/groups/${group.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold"
                    >
                      Open group
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-5">
          {(isModerator || isAdmin) ? (
            <div className="glass-panel p-6 sm:p-7 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Create group</p>
                <h2 className="text-xl font-semibold mt-2">Launch a new chama</h2>
                <p className="text-sm text-[var(--muted)] mt-2">
                  Define contributions, rotation type, and start date in a focused modal flow.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
              >
                <Plus size={16} />
                Open creation form
              </button>
              <p className="text-xs text-[var(--muted)]">
                Tip: invite members immediately after creating the group.
              </p>
            </div>
          ) : (
            <div className="glass-panel p-6 sm:p-7 space-y-4">
              <h2 className="text-xl font-semibold">Join or request access</h2>
              <p className="text-sm text-[var(--muted)]">
                Ask a moderator to invite you, or upgrade to moderator access to manage groups.
              </p>
              <Link
                href="/moderator-signup"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
              >
                Become a moderator
                <ArrowRight size={16} />
              </Link>
            </div>
          )}

          <div className="glass-panel p-6 sm:p-7 space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Quick tools</p>
            <Link
              href="/chama/ledger"
              className="inline-flex items-center justify-between w-full rounded-2xl border border-[var(--glass-border)] bg-white/70 px-4 py-3 text-sm font-semibold"
            >
              Open contribution ledger
              <ArrowRight size={16} />
            </Link>
            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 px-4 py-3 text-xs text-[var(--muted)]">
              Coming soon: SMS reminders, auto-payment tracking, and exportable statements.
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create a new chama"
        subtitle="Set the contribution amount, rotation type, and start date."
        size="lg"
      >
        <div className="space-y-4">
          <input
            className={inputClass}
            placeholder="Group name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className={inputClass}
            placeholder="Description (optional)"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              className={inputClass}
              type="number"
              placeholder="Contribution amount (KES)"
              value={form.contributionAmount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contributionAmount: event.target.value }))
              }
            />
            <select
              className={inputClass}
              value={form.frequency}
              onChange={(event) => setForm((prev) => ({ ...prev, frequency: event.target.value }))}
            >
              <option value="weekly">Weekly</option>
              <option value="bi-weekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input
              className={inputClass}
              type="number"
              placeholder="Expected members"
              value={form.numberOfMembers}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, numberOfMembers: event.target.value }))
              }
            />
            <input
              className={inputClass}
              type="date"
              value={form.startDate}
              onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
            />
            <select
              className={inputClass}
              value={form.rotationType}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, rotationType: event.target.value }))
              }
            >
              <option value="manual">Rotation: Manual</option>
              <option value="random">Rotation: Random</option>
            </select>
            <select
              className={inputClass}
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
            >
              <option value="KES">KES</option>
              <option value="USD">USD</option>
              <option value="UGX">UGX</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleCreateGroup}
            disabled={createPending}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {createPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {createPending ? "Creating..." : "Create chama"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
