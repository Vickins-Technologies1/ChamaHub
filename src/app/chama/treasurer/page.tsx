"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Receipt,
  Wallet,
  CalendarCheck,
  Coins,
  Download,
  Filter,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { PDFDownloadLink } from "@react-pdf/renderer";
import TreasurerLedgerPdf from "@/components/chama/TreasurerLedgerPdf";
import Modal from "@/components/Modal";

type GroupSummary = {
  id: string;
  name: string;
  contributionAmount: number;
  frequency: string;
  currency: string;
  status: string;
  potAmount: number;
  membership?: { role?: string | null; status?: string | null } | null;
};

type GroupDetail = {
  id: string;
  name: string;
  description: string;
  contributionAmount: number;
  frequency: string;
  numberOfMembers: number;
  startDate: string;
  currency: string;
  status: string;
  currentRound: number;
};

type OpenRound = {
  id: string;
  roundNumber: number;
  recipientMemberId: string;
  dueDate?: string;
  totalContributions: number;
  receivedAt?: string;
};

type Member = {
  id: string;
  name?: string;
  email?: string;
  role: string;
  status: string;
};

type Contribution = {
  id: string;
  roundId: string;
  memberId: string;
  amount: number;
  method: string;
  reference?: string;
  paidAt?: string;
};

const inputClass = "glass-input";

export default function TreasurerPanelPage() {
  const { data: session } = authClient.useSession();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [groupStats, setGroupStats] = useState<{ potAmount: number; membersCount: number } | null>(
    null
  );
  const [openRound, setOpenRound] = useState<OpenRound | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [recordOpen, setRecordOpen] = useState(false);

  const [recordForm, setRecordForm] = useState({
    memberId: "",
    amount: "",
    method: "manual",
    reference: "",
  });
  const [exportFilters, setExportFilters] = useState({
    dateFrom: "",
    dateTo: "",
    memberId: "all",
    method: "all",
  });

  const treasurerGroups = useMemo(
    () => groups.filter((group) => group.membership?.role === "treasurer"),
    [groups]
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: groupDetail?.currency ?? "KES",
        maximumFractionDigits: 0,
      }),
    [groupDetail?.currency]
  );

  const setPendingKey = (key: string, value: boolean) =>
    setPending((prev) => ({ ...prev, [key]: value }));

  const loadGroups = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chama/groups", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load groups.");
      setGroups(data.groups ?? []);
      const firstGroup = (data.groups ?? []).find(
        (group: GroupSummary) => group.membership?.role === "treasurer"
      );
      setSelectedGroup((prev) => prev || firstGroup?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load groups.");
    } finally {
      setLoading(false);
    }
  };

  const loadGroupDetail = async (groupId: string) => {
    if (!groupId) return;
    setError("");
    try {
      const [groupRes, membersRes, contribRes] = await Promise.all([
        fetch(`/api/chama/groups/${groupId}`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/members`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/contributions`, { cache: "no-store" }),
      ]);
      const groupData = await groupRes.json();
      const membersData = await membersRes.json();
      const contribData = await contribRes.json();
      if (!groupRes.ok) throw new Error(groupData?.error || "Unable to load group.");
      if (!membersRes.ok) throw new Error(membersData?.error || "Unable to load members.");
      if (!contribRes.ok) throw new Error(contribData?.error || "Unable to load contributions.");
      setGroupDetail(groupData.group ?? null);
      setGroupStats(groupData.stats ?? null);
      setOpenRound(groupData.openRound ?? null);
      setMembers(membersData.members ?? []);
      setContributions(contribData.contributions ?? []);
      setRecordForm((prev) => ({
        ...prev,
        memberId: membersData.members?.[0]?.id ?? "",
        amount: String(groupData.group?.contributionAmount ?? ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load treasurer panel.");
    }
  };

  useEffect(() => {
    if (session?.user) {
      loadGroups();
    }
  }, [session?.user]);

  useEffect(() => {
    if (selectedGroup) {
      loadGroupDetail(selectedGroup);
    }
  }, [selectedGroup]);

  const handleRecordContribution = async () => {
    setMessage("");
    setError("");
    if (!openRound?.id) {
      setError("There is no open round to record contributions.");
      return;
    }
    if (!recordForm.memberId || !recordForm.amount) {
      setError("Select a member and amount.");
      return;
    }
    const pendingKey = "contribution-record";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${selectedGroup}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: openRound.id,
          memberId: recordForm.memberId,
          amount: recordForm.amount,
          method: recordForm.method,
          reference: recordForm.reference,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to record contribution.");
      setMessage("Contribution recorded.");
      setRecordOpen(false);
      await loadGroupDetail(selectedGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record contribution.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const recipient = members.find((member) => member.id === openRound?.recipientMemberId);
  const filteredContributions = useMemo(() => {
    const from = exportFilters.dateFrom ? new Date(exportFilters.dateFrom) : null;
    const to = exportFilters.dateTo
      ? new Date(`${exportFilters.dateTo}T23:59:59.999`)
      : null;
    const methodFilter = exportFilters.method === "all" ? null : exportFilters.method;
    return contributions.filter((contribution) => {
      if (exportFilters.memberId !== "all" && contribution.memberId !== exportFilters.memberId) {
        return false;
      }
      if (methodFilter && contribution.method?.toLowerCase() !== methodFilter.toLowerCase()) {
        return false;
      }
      if (!from && !to) return true;
      const paidAt = contribution.paidAt ? new Date(contribution.paidAt) : null;
      if (!paidAt) return false;
      if (from && paidAt < from) return false;
      if (to && paidAt > to) return false;
      return true;
    });
  }, [contributions, exportFilters]);

  const ledgerEntries = filteredContributions.map((contribution) => {
    const member = members.find((item) => item.id === contribution.memberId);
    return {
      memberName: member?.name || member?.email || "Member",
      amount: contribution.amount,
      method: contribution.method,
      reference: contribution.reference,
      paidAt: contribution.paidAt,
    };
  });
  const ledgerFileName = `chama-ledger-${selectedGroup}.pdf`;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel h-32 shimmer-line" />
        <div className="glass-panel h-64 shimmer-line" />
      </div>
    );
  }

  if (treasurerGroups.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Treasurer control panel
        </p>
        <h1 className="text-2xl font-semibold">No treasurer access yet</h1>
        <p className="text-sm text-[var(--muted)]">
          Ask your moderator to assign you the treasurer role inside a ChamaHub group.
        </p>
        <Link
          href="/chama/groups"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--button-bg)]"
        >
          View groups
          <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_55%)]" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs sm:text-sm uppercase tracking-[0.3em] text-[var(--accent)]">
              <Coins size={16} />
              Treasurer Control
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-3">
              Track contributions and payouts with confidence.
            </h1>
            <p className="text-sm text-[var(--muted)] mt-3 max-w-2xl">
              Manage contributions, open-round payouts, and keep the group ledger clean.
            </p>
          </div>
          <div className="flex flex-col gap-2 min-w-[220px]">
            <label className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Active group
            </label>
            <select
              className={inputClass}
              value={selectedGroup}
              onChange={(event) => setSelectedGroup(event.target.value)}
            >
              {treasurerGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && <div className="glass-panel p-4 text-sm text-rose-500">{error}</div>}
      {message && <div className="glass-panel p-4 text-sm">{message}</div>}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: "Open pot",
            value: groupStats ? currencyFormatter.format(groupStats.potAmount) : "—",
            icon: Wallet,
          },
          {
            label: "Contributions logged",
            value: openRound
              ? currencyFormatter.format(openRound.totalContributions ?? 0)
              : "—",
            icon: Receipt,
          },
          {
            label: "Next due date",
            value: openRound?.dueDate ? new Date(openRound.dueDate).toLocaleDateString() : "—",
            icon: CalendarCheck,
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
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Record</p>
            <h2 className="text-xl font-semibold mt-2">Log a contribution</h2>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Record a payment in a modal so the dashboard doesn’t shift or reload.
          </p>
          <button
            type="button"
            onClick={() => setRecordOpen(true)}
            disabled={!openRound}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            <Receipt size={16} />
            New contribution
          </button>
          {!openRound && (
            <p className="text-sm text-[var(--muted)]">
              There is no open round right now. Contributions will unlock once a cycle starts.
            </p>
          )}
        </div>

        <div className="glass-panel p-6 sm:p-7 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Payout status
            </p>
            <h2 className="text-xl font-semibold mt-2">Open round snapshot</h2>
          </div>
          <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Recipient</p>
              <p className="text-lg font-semibold mt-2">
                {recipient?.name || recipient?.email || "Pending"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
              <span>Round {openRound?.roundNumber ?? "—"}</span>
              <span>Members {groupStats?.membersCount ?? "—"}</span>
              <span>Due {openRound?.dueDate ? new Date(openRound.dueDate).toLocaleDateString() : "—"}</span>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {openRound?.receivedAt ? "Marked as paid" : "Awaiting payout confirmation"}
            </div>
          </div>
        </div>
      </section>

      <section className="glass-panel p-6 sm:p-7 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Ledger</p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-xl font-semibold mt-2">Recent contributions</h2>
            <PDFDownloadLink
              document={
                <TreasurerLedgerPdf
                  groupName={groupDetail?.name || "ChamaHub group"}
                  currency={groupDetail?.currency || "KES"}
                  entries={ledgerEntries}
                />
              }
              fileName={ledgerFileName}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--button-bg)]"
            >
              <Download size={14} />
              Download PDF
            </PDFDownloadLink>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
            <Filter size={14} />
            Export filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="date"
              className={inputClass}
              value={exportFilters.dateFrom}
              onChange={(event) =>
                setExportFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
              }
            />
            <input
              type="date"
              className={inputClass}
              value={exportFilters.dateTo}
              onChange={(event) =>
                setExportFilters((prev) => ({ ...prev, dateTo: event.target.value }))
              }
            />
            <select
              className={inputClass}
              value={exportFilters.memberId}
              onChange={(event) =>
                setExportFilters((prev) => ({ ...prev, memberId: event.target.value }))
              }
            >
              <option value="all">All members</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email || "Member"}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={exportFilters.method}
              onChange={(event) =>
                setExportFilters((prev) => ({ ...prev, method: event.target.value }))
              }
            >
              <option value="all">All methods</option>
              {Array.from(new Set(contributions.map((item) => item.method || "manual"))).map(
                (method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                )
              )}
            </select>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {filteredContributions.length} entries will be exported with the current filters.
          </p>
        </div>
        <div className="space-y-3">
          {filteredContributions.map((contribution) => {
            const member = members.find((item) => item.id === contribution.memberId);
            return (
              <div
                key={contribution.id}
                className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{member?.name || member?.email || "Member"}</p>
                  <span className="text-sm font-semibold">
                    {currencyFormatter.format(contribution.amount)}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {contribution.method} •{" "}
                  {contribution.paidAt
                    ? new Date(contribution.paidAt).toLocaleDateString()
                    : "Today"}
                </p>
              </div>
            );
          })}
          {filteredContributions.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No contributions match the current filters.
            </p>
          )}
        </div>
      </section>

      <Modal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        title="Record contribution"
        subtitle="Log a payment with a button loader (no page reload)."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <select
              className={inputClass}
              value={recordForm.memberId}
              onChange={(event) =>
                setRecordForm((prev) => ({ ...prev, memberId: event.target.value }))
              }
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email || "Member"}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              type="number"
              placeholder="Amount"
              value={recordForm.amount}
              onChange={(event) => setRecordForm((prev) => ({ ...prev, amount: event.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Method (manual / mpesa)"
              value={recordForm.method}
              onChange={(event) => setRecordForm((prev) => ({ ...prev, method: event.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Reference (optional)"
              value={recordForm.reference}
              onChange={(event) =>
                setRecordForm((prev) => ({ ...prev, reference: event.target.value }))
              }
            />
          </div>
          {!openRound?.id ? (
            <p className="text-sm text-rose-500">There is no open round right now.</p>
          ) : null}
          <button
            type="button"
            onClick={handleRecordContribution}
            disabled={!openRound?.id || pending["contribution-record"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {pending["contribution-record"] ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Receipt size={16} />
            )}
            {pending["contribution-record"] ? "Recording..." : "Record contribution"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
