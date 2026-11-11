"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Loader2, Sparkles, Users, Wallet } from "lucide-react";
import Modal from "@/components/Modal";

type Metrics = {
  totalGroups: number;
  activeGroups: number;
  totalMembers: number;
  activeMembers: number;
  openRounds: number;
  upcomingPayouts: number;
  totalCollected: number;
  totalContributions: number;
};

type GroupRow = {
  id: string;
  name: string;
  frequency: string;
  contributionAmount: number;
  currency: string;
  status: string;
  createdAt: string;
  createdBy: string;
  membersCount: number;
  activeMembers: number;
  members: Array<{
    id: string;
    userId?: string | null;
    name?: string;
    email?: string;
    role?: string;
    status?: string;
  }>;
  openRound?: {
    roundNumber: number;
    dueDate?: string;
    potAmount: number;
  } | null;
  totalCollected: number;
  contributionsCount: number;
  lastContributionAt?: string | null;
};

const inputClass = "glass-input";

export default function ChamaHubAdminPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [manageGroupId, setManageGroupId] = useState<string | null>(null);
  const [transferMemberId, setTransferMemberId] = useState("");
  const [attachEmail, setAttachEmail] = useState("");
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const setPendingKey = (key: string, value: boolean) =>
    setPending((prev) => ({ ...prev, [key]: value }));

  const loadData = async (options: { signal?: AbortSignal; silent?: boolean } = {}) => {
    const { signal, silent } = options;
    if (silent) setRefreshing(true);
    else setInitialLoading(true);

    setError((prev) => (silent ? prev : ""));
    try {
      const response = await fetch("/api/admin/chamahub", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load ChamaHub analytics.");
      setMetrics(data.metrics ?? null);
      setGroups(data.groups ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load analytics.");
    } finally {
      if (silent) setRefreshing(false);
      else setInitialLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadData({ signal: controller.signal });
    return () => controller.abort();
  }, []);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const query = search.trim().toLowerCase();
    return groups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groups, search]);

  const manageGroup = useMemo(
    () => (manageGroupId ? groups.find((group) => group.id === manageGroupId) ?? null : null),
    [groups, manageGroupId]
  );

  const formatMoney = (amount: number, currency = "KES") => {
    if (!amount) return `${currency} 0`;
    try {
      return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };

  const updateGroup = async (payload: Record<string, string>, pendingKey: string) => {
    setActionMessage("");
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch("/api/admin/chamahub", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update group.");
      setActionMessage(data?.message ?? "Update saved.");
      await loadData({ silent: true });
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Unable to update group.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const openManageModal = (groupId: string) => {
    setManageGroupId(groupId);
    setTransferMemberId("");
    setAttachEmail("");
  };

  const closeManageModal = () => setManageGroupId(null);

  return (
    <div className="space-y-8">
      <section className="glass-panel p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(27,92,255,0.18),_transparent_55%)]" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs sm:text-sm uppercase tracking-[0.3em] text-[var(--button-bg)]">
              <Sparkles size={16} />
              ChamaHub Analytics
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mt-3">
              Monitor group performance and member activity.
            </h1>
            <p className="text-sm sm:text-base text-[var(--muted)] mt-3 max-w-2xl">
              Track leases per group, member participation, and contribution flow in one admin view.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/moderator-signup"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold shadow-lg hover:-translate-y-0.5 transition"
            >
              Add new moderator
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/chama"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[var(--glass-border)] bg-white/60 text-[var(--foreground)] text-sm font-semibold hover:bg-[var(--hover-bg)] transition"
            >
              View ChamaHub
            </Link>
          </div>
        </div>
      </section>

      {error && <div className="glass-panel p-4 text-sm text-rose-500">{error}</div>}
      {actionMessage && (
        <div className="glass-panel p-4 text-sm text-[var(--foreground)]">{actionMessage}</div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {[
          {
            label: "Active Groups",
            value: metrics ? `${metrics.activeGroups}/${metrics.totalGroups}` : "--",
            icon: Users,
          },
          {
            label: "Active Members",
            value: metrics ? `${metrics.activeMembers}/${metrics.totalMembers}` : "--",
            icon: Users,
          },
          {
            label: "Open Rounds",
            value: metrics ? `${metrics.openRounds}` : "--",
            icon: CalendarCheck,
          },
          {
            label: "Total Collected",
            value: metrics ? formatMoney(metrics.totalCollected) : "--",
            icon: Wallet,
          },
        ].map((stat) => (
          <div key={stat.label} className="glass-panel dash-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">{stat.label}</p>
              <stat.icon size={18} className="text-[var(--button-bg)] dashboard-icon" />
            </div>
            <p className="text-xl sm:text-2xl font-semibold mt-3">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="glass-panel p-6 sm:p-7 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Group management</p>
            <h2 className="text-xl sm:text-2xl font-semibold mt-2">ChamaHub groups</h2>
            <p className="text-sm text-[var(--muted)] mt-2">
              View leased groups, member counts, and collection progress.
            </p>
          </div>
          <div className="w-full lg:w-80">
            <input
              className={inputClass}
              placeholder="Search groups..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {initialLoading && groups.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-16 rounded-2xl border border-[var(--glass-border)] bg-white/60"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 sm:p-5 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div>
                    <p className="font-semibold text-lg">{group.name}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {group.frequency} • {group.status} • {group.membersCount} members
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      Contribution: {formatMoney(group.contributionAmount, group.currency)} • Total
                      collected: {formatMoney(group.totalCollected, group.currency)}
                    </p>
                    {group.openRound ? (
                      <p className="text-xs text-[var(--muted)] mt-1">
                        Open round #{group.openRound.roundNumber} • Due{" "}
                        {group.openRound.dueDate
                          ? new Date(group.openRound.dueDate).toLocaleDateString()
                          : "TBD"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/chama/groups/${group.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/80 text-sm font-semibold"
                    >
                      View group
                      <ArrowRight size={14} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => openManageModal(group.id)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/80 text-sm font-semibold"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {filteredGroups.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No groups match your search.</p>
            ) : null}
          </div>
        )}
      </section>

      <Modal
        open={Boolean(manageGroup)}
        onClose={closeManageModal}
        title={manageGroup ? `Manage ${manageGroup.name}` : "Manage group"}
        subtitle="Admin actions run with button loaders (no page reload)."
        size="xl"
      >
        {manageGroup ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                  Group controls
                </p>
                <p className="text-sm text-[var(--muted)] mt-2">
                  Deactivate a lease, transfer moderator ownership, or trigger reminder emails.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateGroup(
                    {
                      action: manageGroup.status === "archived" ? "activate" : "archive",
                      groupId: manageGroup.id,
                    },
                    `status:${manageGroup.id}`
                  )
                }
                disabled={pending[`status:${manageGroup.id}`]}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
              >
                {pending[`status:${manageGroup.id}`] ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                {manageGroup.status === "archived" ? "Activate group" : "Deactivate group"}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Members</p>
                <div className="space-y-2 max-h-[380px] overflow-auto pr-1">
                  {manageGroup.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-[var(--glass-border)] bg-white/70 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {member.name || member.email || "Member"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {member.email || "No email"} • {member.role}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {member.userId ? (
                            <span className="inline-flex items-center text-[10px] uppercase tracking-[0.2em] bg-emerald-100 text-emerald-600 px-2 py-1 rounded-full">
                              Invite accepted
                            </span>
                          ) : null}
                          {member.userId && member.userId === manageGroup.createdBy ? (
                            <span className="inline-flex items-center text-[10px] uppercase tracking-[0.2em] bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                              Current moderator
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                        {member.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Transfer ownership
                  </p>
                  <select
                    className={inputClass}
                    value={transferMemberId}
                    onChange={(event) => setTransferMemberId(event.target.value)}
                  >
                    <option value="">Select member</option>
                    {manageGroup.members
                      .filter((member) => member.userId && member.status === "active")
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name || member.email}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      updateGroup(
                        { action: "transfer", groupId: manageGroup.id, memberId: transferMemberId },
                        `transfer:${manageGroup.id}`
                      )
                    }
                    disabled={!transferMemberId || pending[`transfer:${manageGroup.id}`]}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold disabled:opacity-60"
                  >
                    {pending[`transfer:${manageGroup.id}`] ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : null}
                    Transfer ownership
                  </button>
                  <p className="text-xs text-[var(--muted)]">
                    Only active members with a linked account can become moderator.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Force-join member
                  </p>
                  <input
                    className={inputClass}
                    placeholder="member@email.com"
                    value={attachEmail}
                    onChange={(event) => setAttachEmail(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateGroup(
                        { action: "force-join", groupId: manageGroup.id, email: attachEmail },
                        `force-join:${manageGroup.id}`
                      )
                    }
                    disabled={!attachEmail || pending[`force-join:${manageGroup.id}`]}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold disabled:opacity-60"
                  >
                    {pending[`force-join:${manageGroup.id}`] ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : null}
                    Attach member
                  </button>
                  <p className="text-xs text-[var(--muted)]">
                    Attach a member by email, even if they haven’t accepted an invite.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Invite reminders
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      updateGroup(
                        { action: "send-reminders", groupId: manageGroup.id },
                        `reminders:${manageGroup.id}`
                      )
                    }
                    disabled={pending[`reminders:${manageGroup.id}`]}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold disabled:opacity-70"
                  >
                    {pending[`reminders:${manageGroup.id}`] ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : null}
                    Send reminder emails
                  </button>
                  <p className="text-xs text-[var(--muted)]">
                    Reminds invited members without linked accounts.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>{refreshing ? "Refreshing analytics…" : "Up to date."}</span>
              <button
                type="button"
                onClick={() => loadData({ silent: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-[var(--glass-border)] bg-white/70 font-semibold disabled:opacity-70"
              >
                {refreshing ? <Loader2 size={14} className="animate-spin" /> : null}
                Refresh
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

