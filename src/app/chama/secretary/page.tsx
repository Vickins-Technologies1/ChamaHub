"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Users,
  MailPlus,
  Loader2,
  ClipboardCheck,
  CalendarClock,
  ScrollText,
  Megaphone,
} from "lucide-react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import Modal from "@/components/Modal";

type GroupSummary = {
  id: string;
  name: string;
  contributionAmount: number;
  frequency: string;
  currency: string;
  status: string;
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

type Member = {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  role: string;
  status: string;
  joinedAt?: string;
};

type MeetingMinute = {
  id: string;
  title: string;
  meetingDate: string;
  summary?: string;
  actionItems?: string;
  createdAt?: string;
};

type Announcement = {
  id: string;
  title: string;
  message: string;
  deliveryChannels?: string[];
  scheduledFor?: string;
  createdAt?: string;
};

const inputClass = "glass-input";
const textAreaClass = `${inputClass} min-h-[120px] resize-none`;

export default function SecretaryPanelPage() {
  const { data: session } = authClient.useSession();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [minutes, setMinutes] = useState<MeetingMinute[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const [inviteOpen, setInviteOpen] = useState(false);
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);

  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [minutesForm, setMinutesForm] = useState({
    title: "",
    meetingDate: "",
    summary: "",
    actionItems: "",
  });

  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    message: "",
    deliveryChannels: ["in-app", "email"],
    scheduledFor: "",
  });

  const secretaryGroups = useMemo(
    () => groups.filter((group) => group.membership?.role === "secretary"),
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
        (group: GroupSummary) => group.membership?.role === "secretary"
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
      const [groupRes, membersRes, minutesRes, announcementsRes] = await Promise.all([
        fetch(`/api/chama/groups/${groupId}`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/members`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/minutes`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/announcements`, { cache: "no-store" }),
      ]);
      const groupData = await groupRes.json();
      const membersData = await membersRes.json();
      const minutesData = await minutesRes.json();
      const announcementsData = await announcementsRes.json();
      if (!groupRes.ok) throw new Error(groupData?.error || "Unable to load group.");
      if (!membersRes.ok) throw new Error(membersData?.error || "Unable to load members.");
      if (!minutesRes.ok) throw new Error(minutesData?.error || "Unable to load minutes.");
      if (!announcementsRes.ok)
        throw new Error(announcementsData?.error || "Unable to load announcements.");
      setGroupDetail(groupData.group ?? null);
      setMembers(membersData.members ?? []);
      setMinutes(minutesData.minutes ?? []);
      setAnnouncements(announcementsData.announcements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load secretary panel.");
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

  const handleInviteMember = async () => {
    setMessage("");
    setError("");
    if (!inviteForm.email && !inviteForm.phone) {
      setError("Provide an email or phone number.");
      return;
    }
    const pendingKey = "invite-member";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${selectedGroup}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inviteForm, role: "member" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to invite member.");
      setMessage("Invite sent. Member is pending approval.");
      setInviteForm({ name: "", email: "", phone: "" });
      setInviteOpen(false);
      await loadGroupDetail(selectedGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to invite member.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleUpdateMember = async (memberId: string, updates: Record<string, string>) => {
    setMessage("");
    setError("");
    const pendingKey = updates.status
      ? `member-status:${memberId}:${updates.status}`
      : `member-update:${memberId}`;
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${selectedGroup}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to update member.");
      setMessage("Member updated.");
      await loadGroupDetail(selectedGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update member.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleCreateMinutes = async () => {
    setMessage("");
    setError("");
    if (!minutesForm.title || !minutesForm.meetingDate) {
      setError("Provide a meeting title and date.");
      return;
    }
    const pendingKey = "minutes-create";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${selectedGroup}/minutes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(minutesForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to save minutes.");
      setMessage("Meeting minutes saved.");
      setMinutesForm({ title: "", meetingDate: "", summary: "", actionItems: "" });
      setMinutesOpen(false);
      await loadGroupDetail(selectedGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save minutes.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const handleCreateAnnouncement = async () => {
    setMessage("");
    setError("");
    if (!announcementForm.title || !announcementForm.message) {
      setError("Provide an announcement title and message.");
      return;
    }
    const pendingKey = "announcement-create";
    setPendingKey(pendingKey, true);
    try {
      const response = await fetch(`/api/chama/groups/${selectedGroup}/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: announcementForm.title,
          message: announcementForm.message,
          deliveryChannels: announcementForm.deliveryChannels,
          scheduledFor: announcementForm.scheduledFor || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to publish announcement.");
      setMessage("Announcement published.");
      setAnnouncementForm({
        title: "",
        message: "",
        deliveryChannels: ["in-app", "email"],
        scheduledFor: "",
      });
      setAnnouncementOpen(false);
      await loadGroupDetail(selectedGroup);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to publish announcement.");
    } finally {
      setPendingKey(pendingKey, false);
    }
  };

  const pendingMembers = members.filter((member) => member.status === "pending");
  const activeMembers = members.filter((member) => member.status === "active");

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="glass-panel h-32 shimmer-line" />
        <div className="glass-panel h-64 shimmer-line" />
      </div>
    );
  }

  if (secretaryGroups.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
          Secretary control panel
        </p>
        <h1 className="text-2xl font-semibold">No secretary access yet</h1>
        <p className="text-sm text-[var(--muted)]">
          Ask your moderator to assign you the secretary role inside a ChamaHub group.
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
        <div className="absolute inset-0 opacity-70 bg-[radial-gradient(circle_at_top,_rgba(0,144,224,0.18),_transparent_55%)]" />
        <div className="relative z-10 flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs sm:text-sm uppercase tracking-[0.3em] text-[var(--accent)]">
              <ClipboardCheck size={16} />
              Secretary Control
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold mt-3">
              Keep member records and communication organized.
            </h1>
            <p className="text-sm text-[var(--muted)] mt-3 max-w-2xl">
              Track approvals, maintain the member roster, and keep every invite on time.
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
              {secretaryGroups.map((group) => (
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
            label: "Active members",
            value: activeMembers.length,
            icon: Users,
          },
          {
            label: "Pending approvals",
            value: pendingMembers.length,
            icon: MailPlus,
          },
          {
            label: "Contribution amount",
            value: groupDetail
              ? currencyFormatter.format(groupDetail.contributionAmount)
              : "—",
            icon: CalendarClock,
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
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
              Pending approvals
            </p>
            <h2 className="text-xl font-semibold mt-2">Review new members</h2>
          </div>
          {pendingMembers.length === 0 ? (
            <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-sm text-[var(--muted)]">
              No pending approvals right now.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingMembers.map((member) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-semibold">{member.name || member.email || "Member"}</p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        {member.email || member.phone || "No contact"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateMember(member.id, { status: "active" })}
                        disabled={pending[`member-status:${member.id}:active`]}
                        className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-[var(--button-bg)] text-white disabled:opacity-70"
                      >
                        {pending[`member-status:${member.id}:active`] ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : null}
                        {pending[`member-status:${member.id}:active`] ? "Accepting..." : "Accept"}
                      </button>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel p-6 sm:p-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Invite</p>
              <h2 className="text-xl font-semibold mt-2">Send a member invite</h2>
              <p className="text-sm text-[var(--muted)] mt-2">
                Invite members by email or phone in a modal (no form clutter on the dashboard).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
            >
              <MailPlus size={16} />
              New invite
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="glass-panel p-6 sm:p-7 space-y-5">
          <div className="flex items-center gap-3">
            <ScrollText size={20} className="text-[var(--accent)]" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Meeting minutes
              </p>
              <h2 className="text-xl font-semibold mt-1">Log a meeting recap</h2>
            </div>
            <button
              type="button"
              onClick={() => setMinutesOpen(true)}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
            >
              <ScrollText size={16} />
              New minutes
            </button>
          </div>
          <div className="space-y-3">
            {minutes.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No meeting minutes logged yet.</p>
            )}
            {minutes.map((minute) => (
              <div
                key={minute.id}
                className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="font-semibold">{minute.title}</p>
                  <span className="text-xs text-[var(--muted)]">
                    {minute.meetingDate
                      ? new Date(minute.meetingDate).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
                {minute.summary && (
                  <p className="text-xs text-[var(--muted)] mt-2">{minute.summary}</p>
                )}
                {minute.actionItems && (
                  <p className="text-xs text-[var(--muted)] mt-2">
                    Action items: {minute.actionItems}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 sm:p-7 space-y-5">
          <div className="flex items-center gap-3">
            <Megaphone size={20} className="text-[var(--accent)]" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                Announcements
              </p>
              <h2 className="text-xl font-semibold mt-1">Share updates</h2>
            </div>
            <button
              type="button"
              onClick={() => setAnnouncementOpen(true)}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
            >
              <Megaphone size={16} />
              New announcement
            </button>
          </div>

          <div className="space-y-3">
            {announcements.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No announcements yet.</p>
            )}
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="font-semibold">{announcement.title}</p>
                  <span className="text-xs text-[var(--muted)]">
                    {announcement.createdAt
                      ? new Date(announcement.createdAt).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-2">{announcement.message}</p>
                <div className="flex flex-wrap gap-2 mt-3 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                  <span className="rounded-full border border-[var(--glass-border)] px-2 py-1">
                    {(announcement.deliveryChannels ?? ["in-app"]).join(" + ")}
                  </span>
                  {announcement.scheduledFor ? (
                    <span className="rounded-full border border-[var(--glass-border)] px-2 py-1">
                      Scheduled{" "}
                      {new Date(announcement.scheduledFor).toLocaleString("en-KE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  ) : (
                    <span className="rounded-full border border-[var(--glass-border)] px-2 py-1">
                      Send now
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel p-6 sm:p-7 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Roster</p>
          <h2 className="text-xl font-semibold mt-2">Member directory</h2>
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
                    <span className="capitalize">{member.role}</span>
                  </p>
                </div>
                <span
                  className={`text-xs px-3 py-1 rounded-full ${
                    member.status === "active"
                      ? "bg-emerald-100 text-emerald-600"
                      : member.status === "pending"
                        ? "bg-amber-100 text-amber-600"
                        : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {member.status}
                </span>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No members found yet.</p>
          )}
        </div>
      </section>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Send a member invite"
        subtitle="Invite by email or phone (the dashboard stays put)."
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <input
              className={inputClass}
              placeholder="Full name"
              value={inviteForm.name}
              onChange={(event) => setInviteForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Email"
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
            <input
              className={inputClass}
              placeholder="Phone"
              value={inviteForm.phone}
              onChange={(event) =>
                setInviteForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </div>
          <button
            type="button"
            onClick={handleInviteMember}
            disabled={pending["invite-member"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {pending["invite-member"] ? <Loader2 size={16} className="animate-spin" /> : <MailPlus size={16} />}
            {pending["invite-member"] ? "Sending..." : "Send invite"}
          </button>
        </div>
      </Modal>

      <Modal
        open={minutesOpen}
        onClose={() => setMinutesOpen(false)}
        title="Log meeting minutes"
        subtitle="Capture the recap and action items."
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <input
              className={inputClass}
              placeholder="Meeting title"
              value={minutesForm.title}
              onChange={(event) => setMinutesForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <input
              className={inputClass}
              type="date"
              value={minutesForm.meetingDate}
              onChange={(event) =>
                setMinutesForm((prev) => ({ ...prev, meetingDate: event.target.value }))
              }
            />
            <textarea
              className={textAreaClass}
              placeholder="Summary notes"
              value={minutesForm.summary}
              onChange={(event) =>
                setMinutesForm((prev) => ({ ...prev, summary: event.target.value }))
              }
            />
            <textarea
              className={textAreaClass}
              placeholder="Action items (optional)"
              value={minutesForm.actionItems}
              onChange={(event) =>
                setMinutesForm((prev) => ({ ...prev, actionItems: event.target.value }))
              }
            />
          </div>
          <button
            type="button"
            onClick={handleCreateMinutes}
            disabled={pending["minutes-create"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {pending["minutes-create"] ? <Loader2 size={16} className="animate-spin" /> : <ScrollText size={16} />}
            {pending["minutes-create"] ? "Saving..." : "Save minutes"}
          </button>
        </div>
      </Modal>

      <Modal
        open={announcementOpen}
        onClose={() => setAnnouncementOpen(false)}
        title="Publish announcement"
        subtitle="Choose delivery channels and send now or schedule."
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <input
              className={inputClass}
              placeholder="Announcement title"
              value={announcementForm.title}
              onChange={(event) =>
                setAnnouncementForm((prev) => ({ ...prev, title: event.target.value }))
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={announcementForm.deliveryChannels.includes("email")}
                  onChange={(event) => {
                    setAnnouncementForm((prev) => {
                      const next = new Set(prev.deliveryChannels);
                      if (event.target.checked) next.add("email");
                      else next.delete("email");
                      next.add("in-app");
                      return { ...prev, deliveryChannels: Array.from(next) };
                    });
                  }}
                />
                Email delivery
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={announcementForm.deliveryChannels.includes("sms")}
                  onChange={(event) => {
                    setAnnouncementForm((prev) => {
                      const next = new Set(prev.deliveryChannels);
                      if (event.target.checked) next.add("sms");
                      else next.delete("sms");
                      next.add("in-app");
                      return { ...prev, deliveryChannels: Array.from(next) };
                    });
                  }}
                />
                SMS delivery
              </label>
            </div>
            <input
              className={inputClass}
              type="datetime-local"
              value={announcementForm.scheduledFor}
              onChange={(event) =>
                setAnnouncementForm((prev) => ({ ...prev, scheduledFor: event.target.value }))
              }
            />
            <textarea
              className={textAreaClass}
              placeholder="Announcement message"
              value={announcementForm.message}
              onChange={(event) =>
                setAnnouncementForm((prev) => ({ ...prev, message: event.target.value }))
              }
            />
          </div>
          <button
            type="button"
            onClick={handleCreateAnnouncement}
            disabled={pending["announcement-create"]}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
          >
            {pending["announcement-create"] ? <Loader2 size={16} className="animate-spin" /> : <Megaphone size={16} />}
            {pending["announcement-create"] ? "Publishing..." : "Publish announcement"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
