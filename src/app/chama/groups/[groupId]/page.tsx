"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RefreshCcw,
  Sparkles,
  UserPlus,
  Video,
  CalendarClock,
} from "lucide-react";
import RotationWheel from "@/components/chama/RotationWheel";
import { authClient } from "@/lib/auth-client";
import Modal from "@/components/Modal";

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
  rotationType: string;
  rotationOrder: string[];
  currentRound: number;
};

type Member = {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  role: string;
  status: string;
  joinedAt?: string;
  contributionTotal: number;
};

type Round = {
  id: string;
  roundNumber: number;
  recipientMemberId: string;
  status: string;
  potAmount: number;
  totalContributions: number;
  dueDate?: string;
  receivedAt?: string;
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

type GroupCall = {
  id: string;
  title: string;
  meetingUri?: string;
  scheduledFor?: string;
  accessType?: string;
  autoRecording?: boolean;
  autoTranscription?: boolean;
  autoSmartNotes?: boolean;
  attendanceCapturedAt?: string;
  attendanceParticipantCount?: number;
  createdAt?: string;
};

const inputClass = "glass-input";

export default function ChamaGroupPage() {
  const params = useParams();
  const groupId = params?.groupId as string;
  const { data: session } = authClient.useSession();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const [calls, setCalls] = useState<GroupCall[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [stats, setStats] = useState<{ membersCount: number; potAmount: number } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const [inviteOpen, setInviteOpen] = useState(false);
  const [contributionOpen, setContributionOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [memberForm, setMemberForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "member",
  });

  const [contributionForm, setContributionForm] = useState({
    memberId: "",
    amount: "",
    method: "manual",
    reference: "",
  });

  const [callForm, setCallForm] = useState({
    title: "",
    scheduledFor: "",
    accessType: "OPEN",
    autoRecording: false,
    autoTranscription: false,
    autoSmartNotes: false,
  });

  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    contributionAmount: "",
    frequency: "monthly",
    startDate: "",
    currency: "KES",
  });

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 0,
      }),
    []
  );

  const setPendingKey = (key: string, value: boolean) =>
    setPending((prev) => ({ ...prev, [key]: value }));

  const loadGroup = async (options: { silent?: boolean } = {}) => {
    if (options.silent) setRefreshing(true);
    else setInitialLoading(true);

    setError((prev) => (options.silent ? prev : ""));
    try {
      const [groupRes, membersRes, roundsRes] = await Promise.all([
        fetch(`/api/chama/groups/${groupId}`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/members`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/rounds`, { cache: "no-store" }),
      ]);

      const groupData = await groupRes.json();
      const membersData = await membersRes.json();
      const roundsData = await roundsRes.json();

      if (!groupRes.ok) throw new Error(groupData?.error || "Failed to load group.");
      if (!membersRes.ok) throw new Error(membersData?.error || "Failed to load members.");
      if (!roundsRes.ok) throw new Error(roundsData?.error || "Failed to load rounds.");

      setGroup(groupData.group);
      setStats(groupData.stats);
      setMembers(membersData.members ?? []);
      setOpenRoundId(membersData.openRoundId ?? null);
      setRounds(roundsData.rounds ?? []);
      setGroupForm({
        name: groupData.group.name,
        description: groupData.group.description,
        contributionAmount: String(groupData.group.contributionAmount),
        frequency: groupData.group.frequency,
        startDate: groupData.group.startDate?.slice(0, 10) ?? "",
        currency: groupData.group.currency,
      });
      setContributionForm((prev) => ({
        ...prev,
        memberId: membersData.members?.[0]?.id ?? "",
        amount: String(groupData.group.contributionAmount ?? ""),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load group.");
    } finally {
      if (options.silent) setRefreshing(false);
      else setInitialLoading(false);
    }
  };

  const loadCalls = async () => {
    if (!groupId) return;
    setCallsLoading(true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}/calls`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load calls.");
      setCalls(data.calls ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load calls.");
    } finally {
      setCallsLoading(false);
    }
  };

  const handleSyncAttendance = async (callId: string) => {
    setMessage("");
    setError("");
    const pendingKey = `attendance:${callId}`;
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(
        `/api/chama/groups/${groupId}/calls/${callId}/attendance/sync`,
        { method: "POST" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to sync attendance.");
      }
      setMessage(`Attendance captured (${data.participantCount ?? 0} participants).`);
      await loadCalls();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sync attendance.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const loadContributions = async (roundId?: string | null) => {
    if (!roundId) {
      setContributions([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/chama/groups/${groupId}/contributions?roundId=${roundId}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to load contributions.");
      setContributions(data.contributions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load contributions.");
    }
  };

  useEffect(() => {
    if (groupId) {
      loadGroup();
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      loadCalls();
    }
  }, [groupId]);

  useEffect(() => {
    loadContributions(openRoundId);
  }, [openRoundId]);

  const handleAddMember = async () => {
    setMessage("");
    setError("");
    if (!memberForm.email && !memberForm.phone) {
      setError("Provide an email or phone number.");
      return;
    }

    const pendingKey = "member-invite";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to invite member.");
      setMessage("Invite sent. Member is pending approval.");
      setMemberForm({ name: "", email: "", phone: "", role: "member" });
      setInviteOpen(false);
      await loadGroup({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to invite member.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleUpdateMember = async (memberId: string, updates: Record<string, string>) => {
    setMessage("");
    setError("");
    const pendingKey = updates.role
      ? `member-role:${memberId}`
      : updates.status
      ? `member-status:${memberId}:${updates.status}`
      : `member-update:${memberId}`;
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update member.");
      setMessage("Member updated.");
      await loadGroup({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update member.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleRecordContribution = async () => {
    setMessage("");
    setError("");
    if (!openRoundId) {
      setError("No open round available.");
      return;
    }
    if (!contributionForm.memberId || !contributionForm.amount) {
      setError("Select a member and amount.");
      return;
    }

    const pendingKey = "contribution-record";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId: openRoundId,
          memberId: contributionForm.memberId,
          amount: contributionForm.amount,
          method: contributionForm.method,
          reference: contributionForm.reference,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to record contribution.");
      setMessage("Contribution recorded.");
      setContributionOpen(false);
      await loadGroup({ silent: true });
      await loadContributions(openRoundId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record contribution.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleAdvanceRound = async () => {
    setMessage("");
    setError("");
    const pendingKey = "round-advance";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to advance round.");
      setMessage("Round advanced to next recipient.");
      await loadGroup({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to advance round.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleMarkReceived = async () => {
    setMessage("");
    setError("");
    const pendingKey = "round-received";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-received" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to mark received.");
      setMessage("Recipient marked as paid.");
      await loadGroup({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark received.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const updateRotationOrder = async (nextOrder: string[], shuffle = false) => {
    setMessage("");
    setError("");
    const pendingKey = "rotation-update";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rotationOrder: nextOrder,
          shuffleRotation: shuffle,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update rotation.");
      setMessage("Rotation order updated.");
      await loadGroup({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update rotation.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleGroupUpdate = async () => {
    setMessage("");
    setError("");
    const pendingKey = "group-update";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update group.");
      setMessage("Group details updated.");
      setSettingsOpen(false);
      await loadGroup({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update group.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleCreateCall = async () => {
    setMessage("");
    setError("");
    if (!callForm.title.trim()) {
      setError("Provide a call title.");
      return;
    }
    const pendingKey = "call-create";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${groupId}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: callForm.title.trim(),
          scheduledFor: callForm.scheduledFor || null,
          accessType: callForm.accessType,
          autoRecording: callForm.autoRecording,
          autoTranscription: callForm.autoTranscription,
          autoSmartNotes: callForm.autoSmartNotes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to create call.");
      setMessage("Group call created.");
      setCallForm({
        title: "",
        scheduledFor: "",
        accessType: "OPEN",
        autoRecording: false,
        autoTranscription: false,
        autoSmartNotes: false,
      });
      setCallOpen(false);
      await loadCalls();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create call.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const rotationMembers = useMemo(() => {
    if (!group?.rotationOrder?.length) return members;
    return group.rotationOrder
      .map((id) => members.find((member) => member.id === id))
      .filter(Boolean) as Member[];
  }, [group?.rotationOrder, members]);

  const rotationOrder = useMemo(() => {
    if (group?.rotationOrder?.length) return group.rotationOrder;
    return members.map((member) => member.id);
  }, [group?.rotationOrder, members]);

  const sessionRoleList = session?.user?.role
    ? session.user.role.split(",").map((value: string) => value.trim())
    : [];
  const isSiteAdmin = sessionRoleList.includes("admin");
  const isModerator = sessionRoleList.includes("moderator");
  const myMember = members.find(
    (member) =>
      member.userId === session?.user?.id ||
      (session?.user?.email && member.email === session.user.email.toLowerCase())
  );
  const hasGroupPrivileges =
    isSiteAdmin ||
    isModerator ||
    ["admin", "treasurer", "secretary"].includes(myMember?.role ?? "");
  const isGroupAdmin = isSiteAdmin || isModerator || myMember?.role === "admin";
  const canManageCalls =
    isSiteAdmin || isModerator || ["admin", "secretary"].includes(myMember?.role ?? "");

  const tabs = useMemo(() => {
    if (hasGroupPrivileges) {
      return [
        { id: "overview", label: "Overview" },
        { id: "members", label: "Members" },
        { id: "contributions", label: "Contributions" },
        { id: "calls", label: "Calls" },
        { id: "settings", label: "Settings" },
      ];
    }
    return [
      { id: "overview", label: "Overview" },
      { id: "contributions", label: "Contributions" },
      { id: "calls", label: "Calls" },
    ];
  }, [hasGroupPrivileges]);

  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!tabs.find((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? "overview");
    }
  }, [tabs, activeTab]);

  if (initialLoading || !group) {
    return (
      <div className="space-y-6">
        <div className="glass-panel h-32 shimmer-line" />
        <div className="glass-panel h-72 shimmer-line" />
      </div>
    );
  }

  const openRound = rounds.find((round) => round.status === "open");
  const recipient = members.find((member) => member.id === openRound?.recipientMemberId);

  return (
    <div className="space-y-8">
      <section className="glass-panel p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(0,144,224,0.18),_transparent_55%)]" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs sm:text-sm uppercase tracking-[0.3em] text-[var(--accent)]">
              <Sparkles size={16} />
              {group.frequency} ChamaHub group
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold mt-3">
              {group.name}
            </h1>
            <p className="text-sm sm:text-base text-[var(--muted)] mt-3 max-w-2xl">
              {group.description || "Organize contributions, rotations, and payouts inside ChamaHub."}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="glass-chip px-4 py-2 text-xs">Currency: {group.currency}</span>
              <span className="glass-chip px-4 py-2 text-xs">
                Contribution: {currencyFormatter.format(group.contributionAmount)}
              </span>
              <span className="glass-chip px-4 py-2 text-xs">
                Members: {stats?.membersCount ?? 0}
              </span>
            </div>
          </div>
          {hasGroupPrivileges && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleMarkReceived}
                disabled={pending["round-received"]}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold disabled:opacity-70"
              >
                {pending["round-received"] ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {pending["round-received"] ? "Marking..." : "Mark recipient paid"}
              </button>
              <button
                type="button"
                onClick={handleAdvanceRound}
                disabled={pending["round-advance"]}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
              >
                {pending["round-advance"] ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowRight size={16} />
                )}
                {pending["round-advance"] ? "Moving..." : "Move to next round"}
              </button>
            </div>
          )}
        </div>
      </section>

      {error && <div className="glass-panel p-4 text-sm text-rose-500">{error}</div>}
      {message && <div className="glass-panel p-4 text-sm">{message}</div>}
      {refreshing && (
        <div className="glass-panel p-3 text-xs text-[var(--muted)] inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" />
          Updating group data…
        </div>
      )}

      <section className="glass-panel p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold border transition ${
                activeTab === tab.id
                  ? "bg-[var(--button-bg)] text-white border-transparent"
                  : "border-[var(--glass-border)] bg-white/70 text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "overview" && (
        <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="glass-panel p-6 sm:p-7 space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Current round</p>
            <h2 className="text-xl font-semibold mt-2">Cycle overview</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[0.9fr_1.1fr] gap-6 items-center">
            <RotationWheel
              members={rotationMembers}
              highlightedId={openRound?.recipientMemberId ?? null}
            />
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                  Recipient
                </p>
                <p className="text-lg font-semibold mt-2">
                  {recipient?.name || recipient?.email || "Pending"}
                </p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Round {openRound?.roundNumber ?? "--"} •{" "}
                  {openRound?.dueDate ? new Date(openRound.dueDate).toLocaleDateString() : "TBD"}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Pot size</p>
                <p className="text-lg font-semibold mt-2">
                  {currencyFormatter.format(stats?.potAmount ?? 0)}
                </p>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Contributions so far: {currencyFormatter.format(openRound?.totalContributions ?? 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {isGroupAdmin ? (
          <div className="glass-panel p-6 sm:p-7 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Rotation order</p>
              <h2 className="text-xl font-semibold mt-2">Update payout sequence</h2>
            </div>
            <div className="space-y-3">
              {rotationMembers.map((member, index) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{member.name || member.email || "Member"}</p>
                    <p className="text-xs text-[var(--muted)] capitalize">{member.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!rotationOrder.length) return;
                        const next = [...rotationOrder];
                        if (index === 0) return;
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        updateRotationOrder(next);
                      }}
                      disabled={pending["rotation-update"]}
                      className="p-2 rounded-full border border-[var(--glass-border)] bg-white/70 disabled:opacity-70"
                    >
                      {pending["rotation-update"] ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ChevronUp size={14} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!rotationOrder.length) return;
                        const next = [...rotationOrder];
                        if (index === next.length - 1) return;
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        updateRotationOrder(next);
                      }}
                      disabled={pending["rotation-update"]}
                      className="p-2 rounded-full border border-[var(--glass-border)] bg-white/70 disabled:opacity-70"
                    >
                      {pending["rotation-update"] ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateRotationOrder(rotationOrder, true)}
              disabled={pending["rotation-update"]}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold disabled:opacity-70"
            >
              {pending["rotation-update"] ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCcw size={16} />
              )}
              {pending["rotation-update"] ? "Updating..." : "Shuffle order"}
            </button>
          </div>
        ) : (
          <div className="glass-panel p-6 sm:p-7 space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Rotation order
            </p>
            <h2 className="text-xl font-semibold">Moderator tools hidden</h2>
            <p className="text-sm text-[var(--muted)]">
              Only moderators can update the payout sequence.
            </p>
          </div>
        )}
        </section>
      )}

      {activeTab === "members" && (
        <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        {hasGroupPrivileges ? (
          <div className="glass-panel p-6 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Members & roles
            </p>
            <h2 className="text-xl font-semibold mt-2">Manage contributors</h2>
            <p className="text-sm text-[var(--muted)] mt-2">
              Assign the Secretary or Treasurer role to unlock their dedicated control panels.
            </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
            >
              <UserPlus size={16} />
              Invite member
            </button>
          </div>
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-semibold">{member.name || member.email || "Member"}</p>
                    <p className="text-xs text-[var(--muted)] mt-1">
                      {member.email || member.phone || "No contact"} •{" "}
                      {member.status}
                    </p>
                    {member.userId && (
                      <span className="inline-flex items-center mt-2 text-[10px] uppercase tracking-[0.2em] bg-emerald-100 text-emerald-600 px-2 py-1 rounded-full">
                        Invite accepted
                      </span>
                    )}
                  </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        disabled={pending[`member-role:${member.id}`]}
                        className="text-xs border border-[var(--glass-border)] rounded-full px-2 py-1 bg-white/70 disabled:opacity-70"
                        value={member.role}
                        onChange={(event) =>
                          handleUpdateMember(member.id, { role: event.target.value })
                        }
                      >
                        {["admin", "treasurer", "secretary", "member"].map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      {pending[`member-role:${member.id}`] ? (
                        <span className="inline-flex items-center px-2">
                          <Loader2 size={14} className="animate-spin text-[var(--muted)]" />
                        </span>
                      ) : null}
                      {member.status !== "active" && (
                        <button
                          type="button"
                          onClick={() => handleUpdateMember(member.id, { status: "active" })}
                          disabled={pending[`member-status:${member.id}:active`]}
                          className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-[var(--button-bg)]/10 text-[var(--button-bg)] disabled:opacity-70"
                        >
                          {pending[`member-status:${member.id}:active`] ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : null}
                          {pending[`member-status:${member.id}:active`] ? "Accepting..." : "Accept"}
                        </button>
                      )}
                      {member.status !== "rejected" && (
                        <button
                          type="button"
                          onClick={() => handleUpdateMember(member.id, { status: "rejected" })}
                          disabled={pending[`member-status:${member.id}:rejected`]}
                          className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-rose-100 text-rose-600 disabled:opacity-70"
                        >
                          {pending[`member-status:${member.id}:rejected`] ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : null}
                          {pending[`member-status:${member.id}:rejected`] ? "Rejecting..." : "Reject"}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--muted)] mt-2">
                    Contribution this round: {currencyFormatter.format(member.contributionTotal)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-panel p-6 sm:p-7 space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Members & roles
            </p>
            <h2 className="text-xl font-semibold">Moderator tools hidden</h2>
            <p className="text-sm text-[var(--muted)]">
              Only moderators can manage members and roles.
            </p>
          </div>
        )}
        </section>
      )}

      {activeTab === "contributions" && (
        <section className="glass-panel p-6 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Contribution log
            </p>
            <h2 className="text-xl font-semibold mt-2">Record contributions</h2>
            </div>
            {hasGroupPrivileges && (
              <button
                type="button"
                onClick={() => setContributionOpen(true)}
                disabled={!openRoundId}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold disabled:opacity-60"
              >
                <Plus size={16} />
                Record contribution
              </button>
            )}
          </div>
          {hasGroupPrivileges ? (
            <p className="text-sm text-[var(--muted)]">
              Use the action button above to log a payment without leaving this page.
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Contributions can be recorded by moderators only.
            </p>
          )}

          <div className="space-y-3">
            {contributions.map((contribution) => {
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
                    {contribution.paidAt ? new Date(contribution.paidAt).toLocaleDateString() : "Today"}
                  </p>
                </div>
              );
            })}
            {contributions.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No contributions logged yet.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === "calls" && (
        <section className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-6">
          <div className="glass-panel p-6 sm:p-7 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Group calls
              </p>
              <h2 className="text-xl font-semibold mt-2">Upcoming and recent calls</h2>
            </div>
            {callsLoading ? (
              <div className="space-y-3">
                {[0, 1].map((item) => (
                  <div key={item} className="glass-panel h-24 shimmer-line" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {calls.map((call) => {
                  const scheduled = call.scheduledFor
                    ? new Date(call.scheduledFor)
                    : null;
                  const isUpcoming = scheduled ? scheduled.getTime() > Date.now() : false;
                  const attendanceCaptured = call.attendanceCapturedAt
                    ? new Date(call.attendanceCapturedAt)
                    : null;
                  return (
                    <div
                      key={call.id}
                      className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="font-semibold">{call.title}</p>
                          <p className="text-xs text-[var(--muted)] mt-1">
                            {scheduled
                              ? scheduled.toLocaleString()
                              : "Start immediately"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`px-3 py-1 rounded-full ${
                              isUpcoming
                                ? "bg-amber-100 text-amber-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {isUpcoming ? "Scheduled" : "Ready"}
                          </span>
                          {typeof call.attendanceParticipantCount === "number" && (
                            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                              Attendance: {call.attendanceParticipantCount}
                            </span>
                          )}
                          {call.meetingUri && (
                            <a
                              href={call.meetingUri}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--button-bg)] text-white"
                            >
                              <Video size={14} />
                              Join
                            </a>
                          )}
                          {canManageCalls && !isUpcoming && (
                            <button
                              type="button"
                              onClick={() => handleSyncAttendance(call.id)}
                              disabled={pending[`attendance:${call.id}`]}
                              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-[var(--glass-border)] text-[var(--foreground)] disabled:opacity-70"
                            >
                              {pending[`attendance:${call.id}`] ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RefreshCcw size={14} />
                              )}
                              {pending[`attendance:${call.id}`] ? "Syncing..." : "Sync attendance"}
                            </button>
                          )}
                        </div>
                      </div>
                      {attendanceCaptured && (
                        <p className="text-xs text-[var(--muted)] mt-2">
                          Attendance captured {attendanceCaptured.toLocaleString()}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-3 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                        <span className="rounded-full border border-[var(--glass-border)] px-2 py-1">
                          {call.accessType || "OPEN"} access
                        </span>
                        {call.autoRecording && (
                          <span className="rounded-full border border-[var(--glass-border)] px-2 py-1">
                            Auto recording
                          </span>
                        )}
                        {call.autoTranscription && (
                          <span className="rounded-full border border-[var(--glass-border)] px-2 py-1">
                            Transcription
                          </span>
                        )}
                        {call.autoSmartNotes && (
                          <span className="rounded-full border border-[var(--glass-border)] px-2 py-1">
                            Smart notes
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {calls.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">
                    No calls scheduled yet. Create a new group call to get started.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="glass-panel p-6 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Call setup</p>
                <h2 className="text-xl font-semibold mt-2">Create a new call</h2>
                <p className="text-sm text-[var(--muted)] mt-2">
                  Schedule a video call and optionally enable recording, transcripts, and smart notes.
                </p>
              </div>
              {canManageCalls ? (
                <button
                  type="button"
                  onClick={() => setCallOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
                >
                  <CalendarClock size={16} />
                  New call
                </button>
              ) : null}
            </div>
            {!canManageCalls && (
              <p className="text-sm text-[var(--muted)]">
                Only moderators or secretaries can schedule group calls.
              </p>
            )}
          </div>
        </section>
      )}

      {activeTab === "settings" && hasGroupPrivileges && (
        <section className="glass-panel p-6 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Group settings</p>
              <h2 className="text-xl font-semibold mt-2">Update core details</h2>
              <p className="text-sm text-[var(--muted)] mt-2">
                Edit the group profile in a modal so the dashboard stays in place.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
            >
              Edit details
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4">
            <div className="flex flex-wrap gap-2">
              <span className="glass-chip px-4 py-2 text-xs">Currency: {group.currency}</span>
              <span className="glass-chip px-4 py-2 text-xs">
                Contribution: {currencyFormatter.format(group.contributionAmount)}
              </span>
              <span className="glass-chip px-4 py-2 text-xs">Frequency: {group.frequency}</span>
              <span className="glass-chip px-4 py-2 text-xs">
                Start: {group.startDate ? new Date(group.startDate).toLocaleDateString() : "—"}
              </span>
            </div>
          </div>
        </section>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite member"
        subtitle="Send an email or phone invite without leaving this dashboard."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              className={inputClass}
              placeholder="Full name"
              value={memberForm.name}
              onChange={(event) => setMemberForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <select
              className={inputClass}
              value={memberForm.role}
              onChange={(event) => setMemberForm((prev) => ({ ...prev, role: event.target.value }))}
            >
              {["member", "secretary", "treasurer", "admin"].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="Email"
              value={memberForm.email}
              onChange={(event) => setMemberForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Phone"
              value={memberForm.phone}
              onChange={(event) => setMemberForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </div>
          <button
            type="button"
            onClick={handleAddMember}
            disabled={pending["member-invite"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {pending["member-invite"] ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {pending["member-invite"] ? "Sending..." : "Send invite"}
          </button>
        </div>
      </Modal>

      <Modal
        open={contributionOpen}
        onClose={() => setContributionOpen(false)}
        title="Record contribution"
        subtitle="Log a payment and refresh the ledger silently."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <select
              className={inputClass}
              value={contributionForm.memberId}
              onChange={(event) =>
                setContributionForm((prev) => ({ ...prev, memberId: event.target.value }))
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
              placeholder="Amount (KES)"
              value={contributionForm.amount}
              onChange={(event) =>
                setContributionForm((prev) => ({ ...prev, amount: event.target.value }))
              }
            />
            <input
              className={inputClass}
              placeholder="Method (manual / mpesa)"
              value={contributionForm.method}
              onChange={(event) =>
                setContributionForm((prev) => ({ ...prev, method: event.target.value }))
              }
            />
            <input
              className={inputClass}
              placeholder="Reference (optional)"
              value={contributionForm.reference}
              onChange={(event) =>
                setContributionForm((prev) => ({ ...prev, reference: event.target.value }))
              }
            />
          </div>

          {!openRoundId ? (
            <p className="text-sm text-rose-500">No open round available.</p>
          ) : null}

          <button
            type="button"
            onClick={handleRecordContribution}
            disabled={!openRoundId || pending["contribution-record"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold disabled:opacity-70"
          >
            {pending["contribution-record"] ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Plus size={16} />
            )}
            {pending["contribution-record"] ? "Recording..." : "Record contribution"}
          </button>
        </div>
      </Modal>

      <Modal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        title="Create a new call"
        subtitle="Leave the date empty to start immediately."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <input
              className={inputClass}
              placeholder="Call title"
              value={callForm.title}
              onChange={(event) => setCallForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <input
              className={inputClass}
              type="datetime-local"
              value={callForm.scheduledFor}
              onChange={(event) =>
                setCallForm((prev) => ({ ...prev, scheduledFor: event.target.value }))
              }
            />
            <select
              className={inputClass}
              value={callForm.accessType}
              onChange={(event) => setCallForm((prev) => ({ ...prev, accessType: event.target.value }))}
            >
              <option value="OPEN">Open access</option>
              <option value="TRUSTED">Trusted access</option>
              <option value="RESTRICTED">Restricted access</option>
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[var(--muted)]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={callForm.autoRecording}
                  onChange={(event) =>
                    setCallForm((prev) => ({ ...prev, autoRecording: event.target.checked }))
                  }
                />
                Auto recording
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={callForm.autoTranscription}
                  onChange={(event) =>
                    setCallForm((prev) => ({ ...prev, autoTranscription: event.target.checked }))
                  }
                />
                Auto transcription
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={callForm.autoSmartNotes}
                  onChange={(event) =>
                    setCallForm((prev) => ({ ...prev, autoSmartNotes: event.target.checked }))
                  }
                />
                Smart notes
              </label>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreateCall}
            disabled={pending["call-create"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {pending["call-create"] ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CalendarClock size={16} />
            )}
            {pending["call-create"] ? "Creating..." : "Create call"}
          </button>
        </div>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Update group details"
        subtitle="Save changes with a button loader (no page skeleton)."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              className={inputClass}
              placeholder="Group name"
              value={groupForm.name}
              onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Description"
              value={groupForm.description}
              onChange={(event) =>
                setGroupForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
            <input
              className={inputClass}
              type="number"
              placeholder="Contribution amount"
              value={groupForm.contributionAmount}
              onChange={(event) =>
                setGroupForm((prev) => ({ ...prev, contributionAmount: event.target.value }))
              }
            />
            <select
              className={inputClass}
              value={groupForm.frequency}
              onChange={(event) =>
                setGroupForm((prev) => ({ ...prev, frequency: event.target.value }))
              }
            >
              <option value="weekly">Weekly</option>
              <option value="bi-weekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <input
              className={inputClass}
              type="date"
              value={groupForm.startDate}
              onChange={(event) => setGroupForm((prev) => ({ ...prev, startDate: event.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Currency"
              value={groupForm.currency}
              onChange={(event) => setGroupForm((prev) => ({ ...prev, currency: event.target.value }))}
            />
          </div>
          <button
            type="button"
            onClick={handleGroupUpdate}
            disabled={pending["group-update"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {pending["group-update"] ? <Loader2 size={16} className="animate-spin" /> : null}
            {pending["group-update"] ? "Saving..." : "Save changes"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
