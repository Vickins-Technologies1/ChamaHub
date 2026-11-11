"use client";

import { useEffect, useState } from "react";

type GroupSummary = {
  id: string;
  name: string;
};

type Contribution = {
  id: string;
  roundId: string;
  memberId: string;
  amount: number;
  method: string;
  paidAt?: string;
};

type Member = {
  id: string;
  name?: string;
  email?: string;
};

const inputClass = "glass-input";

export default function LedgerPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadGroups = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chama/groups", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load groups.");
      setGroups(data.groups ?? []);
      const firstGroup = data.groups?.[0]?.id ?? "";
      setSelectedGroup((prev) => prev || firstGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load groups.");
    } finally {
      setLoading(false);
    }
  };

  const loadContributions = async (groupId: string) => {
    if (!groupId) return;
    try {
      const [contribRes, membersRes] = await Promise.all([
        fetch(`/api/chama/groups/${groupId}/contributions`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/members`, { cache: "no-store" }),
      ]);
      const contribData = await contribRes.json();
      const membersData = await membersRes.json();
      if (!contribRes.ok) throw new Error(contribData?.error || "Unable to load contributions.");
      if (!membersRes.ok) throw new Error(membersData?.error || "Unable to load members.");
      setContributions(contribData.contributions ?? []);
      setMembers(membersData.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load contributions.");
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      loadContributions(selectedGroup);
    }
  }, [selectedGroup]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel h-24 shimmer-line" />
        <div className="glass-panel h-64 shimmer-line" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6 sm:p-7">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Ledger</p>
        <h1 className="text-2xl sm:text-3xl font-semibold mt-2">
          Transaction history
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          Review contribution records across your ChamaHub groups.
        </p>
      </section>

      {error && <div className="glass-panel p-4 text-sm text-rose-500">{error}</div>}

      <section className="glass-panel p-6 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Group</p>
            <h2 className="text-xl font-semibold mt-2">Select a Chama group</h2>
          </div>
          <select
            className={inputClass}
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {contributions.map((contribution) => (
            <div
              key={contribution.id}
              className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {members.find((member) => member.id === contribution.memberId)?.name ||
                    members.find((member) => member.id === contribution.memberId)?.email ||
                    "Member"}
                </p>
                <span className="text-sm font-semibold">KES {contribution.amount}</span>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                {contribution.method} •{" "}
                {contribution.paidAt ? new Date(contribution.paidAt).toLocaleDateString() : "Today"}
              </p>
            </div>
          ))}
          {contributions.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No contributions logged yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
