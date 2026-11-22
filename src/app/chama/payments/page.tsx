"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, CalendarDays, Check, CircleDollarSign, Clock3, FileText, LoaderCircle, Receipt, Search, ShieldCheck, Upload, X } from "lucide-react";
import { formatMinorUnits } from "@/lib/finance/money";

type Group = {
  id: string;
  name: string;
  currency: string;
  status: string;
  membership?: { _id?: string; role?: string; status?: string } | null;
  openRound?: { id: string; roundNumber: number } | null;
};

type GroupMember = { id: string; name?: string; email?: string; role?: string; status?: string };

type Payment = {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  amountMinor: number;
  currency: string;
  amount: number;
  paymentDate: string;
  method: string;
  methodLabel: string;
  reference: string;
  notes: string;
  source: string;
  status: "pending" | "under_review" | "confirmed" | "rejected";
  potentialDuplicate: boolean;
  receipt: { url: string; filename: string; contentType: string; size: number } | null;
  submittedAt: string;
  reviewedAt?: string | null;
  confirmedAt?: string | null;
  rejectionReason?: string;
  lastRejectionReason?: string;
  ledgerTransactionId?: string | null;
};

type PaymentResponse = {
  payments: Payment[];
  canReview: boolean;
  group: { currency: string };
  pagination: { page: number; total: number; totalPages: number };
  summary: { pending: number; underReview: number; confirmed: number; rejected: number; confirmedAmountMinor: number };
};

const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const prettyStatus = (status: Payment["status"]) => ({ pending: "Pending", under_review: "Under review", confirmed: "Confirmed", rejected: "Rejected" })[status];
const statusTone = (status: Payment["status"]) => ({ pending: "bg-amber-100 text-amber-800", under_review: "bg-sky-100 text-sky-800", confirmed: "bg-emerald-100 text-emerald-800", rejected: "bg-rose-100 text-rose-800" })[status];

export default function MemberPaymentsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [summary, setSummary] = useState<PaymentResponse["summary"]>({ pending: 0, underReview: 0, confirmed: 0, rejected: 0, confirmedAmountMinor: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"review" | "mine">("review");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [methodFilter, setMethodFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingId, setEditingId] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("Payment could not be verified");
  const [otherReason, setOtherReason] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState("mpesa");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const submissionKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const group = groups.find((item) => item.id === selectedGroupId) ?? null;
  const canSubmit = Boolean(group?.status === "active" && group.membership && group.membership.status === "active" && group.openRound?.id);
  const currency = group?.currency || "KES";
  const formatAmount = useCallback((minor: number, code = currency) => {
    try { return formatMinorUnits(minor, code); }
    catch { return `${(minor / 100).toFixed(2)} ${code}`; }
  }, [currency]);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    setError("");
    try {
      const response = await fetch("/api/chama/groups", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load your groups.");
      setGroups(data.groups ?? []);
      const requestedGroupId = new URLSearchParams(window.location.search).get("groupId");
      setSelectedGroupId((current) => current || data.groups?.find((item: Group) => item.id === requestedGroupId)?.id || data.groups?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load your groups.");
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    if (!selectedGroupId) { setPayments([]); return; }
    setLoadingPayments(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (methodFilter !== "all") params.set("method", methodFilter);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (view === "mine" && group?.membership?._id) params.set("memberId", group.membership._id);
      if (view === "review" && memberFilter !== "all") params.set("memberId", memberFilter);
      const response = await fetch(`/api/chama/groups/${selectedGroupId}/payments?${params}`, { cache: "no-store" });
      const data = await response.json() as PaymentResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load payment records.");
      setPayments(data.payments ?? []);
      setCanReview(data.canReview);
      if (!data.canReview && statusFilter === "pending") setStatusFilter("all");
      setSummary(data.summary);
      setTotalPages(data.pagination.totalPages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load payment records.");
      setPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  }, [selectedGroupId, page, statusFilter, methodFilter, search, dateFrom, dateTo, view, group?.membership?._id, memberFilter]);

  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => { void loadPayments(); }, [loadPayments]);

  useEffect(() => {
    let active = true;
    const loadMembers = async () => {
      if (!selectedGroupId) { setGroupMembers([]); return; }
      try {
        const response = await fetch(`/api/chama/groups/${selectedGroupId}/members`, { cache: "no-store" });
        const data = await response.json();
        if (active && response.ok) setGroupMembers(data.members ?? []);
      } catch {
        if (active) setGroupMembers([]);
      }
    };
    void loadMembers();
    return () => { active = false; };
  }, [selectedGroupId]);

  const startEdit = (payment: Payment) => {
    setEditingId(payment.id);
    setAmount(String(payment.amount));
    setPaymentDate(new Date(payment.paymentDate).toISOString().slice(0, 10));
    setMethod(payment.method);
    setReference(payment.reference);
    setNotes(payment.notes);
    setMessage("");
    setError("");
  };

  const clearForm = () => {
    setEditingId("");
    setAmount("");
    setPaymentDate(today());
    setMethod("mpesa");
    setReference("");
    setNotes("");
    const input = document.getElementById("payment-receipt") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  const submitPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!group || !selectedGroupId) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("amount", amount);
      form.set("paymentDate", paymentDate);
      form.set("method", method);
      form.set("reference", reference);
      form.set("notes", notes);
      const file = (document.getElementById("payment-receipt") as HTMLInputElement | null)?.files?.[0];
      if (file) form.set("receipt", file);
      const fingerprint = JSON.stringify({ editingId, amount, paymentDate, method, reference: reference.trim(), notes: notes.trim(), file: file ? [file.name, file.size, file.lastModified] : null });
      if (submissionKeyRef.current?.fingerprint !== fingerprint) submissionKeyRef.current = { fingerprint, key: crypto.randomUUID() };
      form.set("idempotencyKey", submissionKeyRef.current.key);
      const url = editingId
        ? `/api/chama/groups/${selectedGroupId}/payments/${editingId}`
        : `/api/chama/groups/${selectedGroupId}/payments`;
      const response = await fetch(url, { method: editingId ? "PATCH" : "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "We couldn't submit your payment. Please try again.");
      submissionKeyRef.current = null;
      clearForm();
      setMessage(data.potentialDuplicate
        ? "Payment submitted for Treasurer verification. It resembles another payment, so the Treasurer will review it carefully."
        : data.message || "Payment submitted and awaiting Treasurer verification.");
      setPage(1);
      await loadPayments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't submit your payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const runReviewAction = async (payment: Payment, action: "start_review" | "confirm" | "reject") => {
    setError("");
    setMessage("");
    try {
      const payload: Record<string, string> = { action };
      if (action === "confirm") payload.reason = "Manual payment receipt and reference verified by Treasurer.";
      if (action === "reject") {
        payload.reason = rejectReason;
        payload.otherDetails = otherReason;
      }
      const response = await fetch(`/api/chama/groups/${selectedGroupId}/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update this payment.");
      setRejectingId("");
      setOtherReason("");
      setMessage(action === "confirm" ? "Payment confirmed and added to the group ledger." : action === "reject" ? "Payment rejected. The member has been notified." : "Payment marked under review.");
      await loadPayments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this payment.");
    }
  };

  const resetFilters = () => {
    setStatusFilter("all"); setMethodFilter("all"); setMemberFilter("all"); setSearch(""); setDateFrom(""); setDateTo(""); setPage(1);
  };

  const memberOptions = useMemo(() => groupMembers
    .filter((item) => item.status === "active")
    .map((item) => [item.id, item.name || item.email || "Member"] as const)
    .sort((a, b) => a[1].localeCompare(b[1])), [groupMembers]);

  if (loadingGroups) return <div className="glass-panel h-64 shimmer-line" />;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="dashboard-page-intro">
        <div className="dashboard-page-intro__icon"><Receipt size={19} /></div>
        <div className="min-w-0 flex-1">
          <p className="dashboard-section-kicker">Group payments</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Payments and verification</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Record a payment you have already made. The Treasurer adds it to the group ledger only after verification.</p>
        </div>
        <label className="sr-only" htmlFor="payment-group">Group</label>
        <select id="payment-group" className="glass-input !rounded-lg !py-2 !text-sm sm:max-w-64" value={selectedGroupId} onChange={(event) => { setSelectedGroupId(event.target.value); setPage(1); setEditingId(""); }}>
          {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          {groups.length === 0 ? <option value="">No groups available</option> : null}
        </select>
      </section>

      {error ? <div className="auth-alert auth-alert--error" role="alert">{error}</div> : null}
      {message ? <div className="auth-alert auth-alert--success" role="status">{message}</div> : null}

      {!group ? <div className="glass-panel p-6 text-sm text-[var(--muted)]">Join an active group to submit and track payments.</div> : <>
        {canSubmit ? <section className="glass-panel overflow-hidden">
          <div className="flex items-start gap-3 border-b border-[var(--dash-border)] p-4 sm:p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dash-sidebar-active)] text-[var(--accent)]"><CircleDollarSign size={19} /></span>
            <div><h3 className="font-semibold">{editingId ? "Correct payment details" : "Submit a payment"}</h3><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Submit a record of the payment you have already made. Your payment will be added to the group ledger after the Treasurer verifies it.</p>
              {group.openRound ? <p className="mt-1 text-xs text-[var(--muted)]">Current contribution round: {group.openRound.roundNumber}</p> : null}
            </div>
          </div>
          {!group.openRound ? <p className="p-5 text-sm text-amber-700">There is no open contribution round available for payment submissions.</p> : <form onSubmit={(event) => void submitPayment(event)} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <label className="space-y-1.5 text-sm font-medium">Amount ({currency})<input className="glass-input w-full" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 2,000" required /></label>
            <label className="space-y-1.5 text-sm font-medium">Date paid<input className="glass-input w-full" type="date" max={today()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></label>
            <label className="space-y-1.5 text-sm font-medium">Payment method<select className="glass-input w-full" value={method} onChange={(event) => setMethod(event.target.value)}><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="other">Other approved method</option></select></label>
            <label className="space-y-1.5 text-sm font-medium">Transaction / reference number{method === "cash" || method === "other" ? <span className="ml-1 font-normal text-[var(--muted)]">(optional)</span> : null}<input className="glass-input w-full" maxLength={120} autoCapitalize="characters" value={reference} onChange={(event) => setReference(event.target.value)} placeholder={method === "mpesa" ? "M-Pesa transaction code" : "Payment reference"} required={method === "mpesa" || method === "bank"} /></label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">Payment receipt <span className="font-normal text-[var(--muted)]">(optional · JPEG, PNG, WebP or PDF · up to 5 MB)</span><span className="flex items-center gap-2"><Upload size={15} className="text-[var(--muted)]" /><input id="payment-receipt" className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--dash-sidebar-hover)] file:px-3 file:py-2 file:text-xs file:font-semibold" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></span></label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2">Notes <span className="font-normal text-[var(--muted)]">(optional)</span><textarea className="glass-input min-h-20 w-full" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a detail that may help the Treasurer verify your payment." /></label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{submitting ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{submitting ? "Submitting…" : editingId ? "Save correction" : "Submit for verification"}</button>
              {editingId ? <button type="button" onClick={clearForm} className="rounded-full border border-[var(--dash-border)] px-5 py-3 text-sm font-semibold">Cancel edit</button> : null}
            </div>
          </form>}
        </section> : <div className="glass-panel flex items-start gap-3 p-4 text-sm text-[var(--muted)]"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" /><p>This account does not have an active member record in the selected group.</p></div>}

        {canReview ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Payment review summary">
          {[
            { title: "Pending", value: summary.pending, icon: Clock3 },
            { title: "Under review", value: summary.underReview, icon: Search },
            { title: "Confirmed", value: summary.confirmed, icon: BadgeCheck },
            { title: "Rejected", value: summary.rejected, icon: X },
            { title: "Confirmed total", value: formatAmount(summary.confirmedAmountMinor), icon: CircleDollarSign },
          ].map((item) => <article key={item.title} className="glass-panel flex items-center gap-3 p-4"><span className="flex size-9 items-center justify-center rounded-xl bg-[var(--dash-sidebar-hover)] text-[var(--accent)]"><item.icon size={17} /></span><div className="min-w-0"><p className="text-xs text-[var(--muted)]">{item.title}</p><p className="mt-1 truncate text-lg font-semibold tabular-nums">{item.value}</p></div></article>)}
        </section> : null}

        <section className="glass-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--dash-border)] p-4 sm:p-5">
            <div><h3 className="font-semibold">{canReview && view === "review" ? "Treasurer review queue" : "My payment history"}</h3><p className="mt-1 text-xs text-[var(--muted)]">{canReview && view === "review" ? "Confirmations post to the official ledger. Rejections include a reason." : "Track submitted, confirmed, and rejected payments."}</p></div>
            {canReview ? <div className="inline-flex rounded-full border border-[var(--dash-border)] p-1"><button type="button" onClick={() => { setView("review"); setStatusFilter("pending"); setPage(1); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${view === "review" ? "bg-[var(--button-bg)] text-white" : "text-[var(--muted)]"}`}>Review queue</button>{group?.membership?._id ? <button type="button" onClick={() => { setView("mine"); setStatusFilter("all"); setPage(1); }} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${view === "mine" ? "bg-[var(--button-bg)] text-white" : "text-[var(--muted)]"}`}>My payments</button> : null}</div> : null}
          </div>
          <div className="grid gap-3 border-b border-[var(--dash-border)] p-4 sm:grid-cols-2 lg:grid-cols-6">
            <label className="dashboard-search-field sm:col-span-2"><Search size={15} /><input aria-label="Search payments" placeholder="Search member, reference or notes" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
            <label className="sr-only" htmlFor="payment-status-filter">Status</label><select id="payment-status-filter" className="glass-input !rounded-lg !py-2 !text-sm" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="all">All statuses</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option></select>
            <label className="sr-only" htmlFor="payment-method-filter">Method</label><select id="payment-method-filter" className="glass-input !rounded-lg !py-2 !text-sm" value={methodFilter} onChange={(event) => { setMethodFilter(event.target.value); setPage(1); }}><option value="all">All methods</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="other">Other</option></select>
            {canReview && view === "review" ? <select aria-label="Filter by member" className="glass-input !rounded-lg !py-2 !text-sm" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); setPage(1); }}><option value="all">All members</option>{memberOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select> : null}
            <label className="sr-only" htmlFor="payment-date-from">From date</label><input id="payment-date-from" aria-label="From date" className="glass-input !rounded-lg !py-2 !text-sm" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
            <label className="sr-only" htmlFor="payment-date-to">To date</label><input id="payment-date-to" aria-label="To date" className="glass-input !rounded-lg !py-2 !text-sm" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
            <button type="button" onClick={resetFilters} className="rounded-lg border border-[var(--dash-border)] px-3 py-2 text-xs font-semibold">Clear filters</button>
          </div>
          {loadingPayments ? <p className="p-6 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Loading payments…</p> : payments.length === 0 ? <div className="dashboard-empty m-4 sm:m-5"><FileText size={18} /><span>{canReview && view === "review" ? "No payments match this review filter." : "Your payment records will appear here."}</span></div> : <div className="divide-y divide-[var(--dash-border)]">
            {payments.map((payment) => <article key={payment.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{canReview && view === "review" ? payment.memberName : formatAmount(payment.amountMinor, payment.currency)}</h4>{canReview && view === "review" ? <span className="font-semibold">{formatAmount(payment.amountMinor, payment.currency)}</span> : null}<span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone(payment.status)}`}>{prettyStatus(payment.status)}</span>{payment.potentialDuplicate ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-[10px] font-semibold text-orange-800"><AlertTriangle size={12} />Possible duplicate</span> : null}</div>
                  {canReview && view === "review" ? <p className="mt-1 text-xs text-[var(--muted)]">{payment.memberEmail}</p> : null}
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]"><span>{payment.methodLabel}</span>{payment.reference ? <span>Reference: {payment.reference}</span> : null}<span className="inline-flex items-center gap-1"><CalendarDays size={13} />Paid {new Date(payment.paymentDate).toLocaleDateString("en-KE")}</span><span>Submitted {new Date(payment.submittedAt).toLocaleString("en-KE")}</span></p>
                  {payment.notes ? <p className="mt-2 text-sm leading-6">{payment.notes}</p> : null}
                  {payment.potentialDuplicate ? <p className="mt-2 text-xs text-orange-800">This submission resembles another payment by the same member. Check its reference and receipt before confirming.</p> : null}
                  {payment.status === "rejected" && payment.rejectionReason ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Needs correction: {payment.rejectionReason}</p> : null}
                  {payment.status !== "rejected" && payment.lastRejectionReason ? <p className="mt-2 text-xs text-[var(--muted)]">Previous review: {payment.lastRejectionReason}</p> : null}
                  {payment.status === "confirmed" && payment.confirmedAt ? <p className="mt-2 text-xs text-emerald-700">Verified {new Date(payment.confirmedAt).toLocaleString("en-KE")} · Ledger entry recorded</p> : null}
                  {payment.receipt ? <a href={payment.receipt.url} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] underline underline-offset-2"><FileText size={14} />Download receipt ({payment.receipt.filename})</a> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canReview && view === "review" && payment.status === "pending" ? <button type="button" onClick={() => void runReviewAction(payment, "start_review")} className="rounded-full border border-[var(--dash-border)] px-3 py-2 text-xs font-semibold">Start review</button> : null}
                  {canReview && view === "review" && ["pending", "under_review"].includes(payment.status) ? <>
                    <button type="button" onClick={() => { if (window.confirm(`Confirm ${formatAmount(payment.amountMinor, payment.currency)} from ${payment.memberName}? This will post it to the official group ledger.`)) void runReviewAction(payment, "confirm"); }} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"><Check size={14} />Confirm payment</button>
                    <button type="button" onClick={() => setRejectingId((current) => current === payment.id ? "" : payment.id)} className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"><X size={14} />Reject</button>
                  </> : null}
                  {view === "mine" && ["pending", "rejected"].includes(payment.status) ? <button type="button" onClick={() => startEdit(payment)} className="rounded-full border border-[var(--dash-border)] px-3 py-2 text-xs font-semibold">{payment.status === "rejected" ? "Correct and resubmit" : "Edit submission"}</button> : null}
                </div>
              </div>
              {rejectingId === payment.id ? <div className="grid gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                <label className="text-xs font-semibold">Reason<select className="glass-input mt-1 w-full !rounded-lg !py-2 !text-sm" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)}><option>Invalid transaction reference</option><option>Incorrect amount</option><option>Duplicate payment</option><option>Receipt does not match</option><option>Payment could not be verified</option><option>Wrong group</option><option>Other</option></select></label>
                {rejectReason === "Other" ? <label className="text-xs font-semibold">Details<input className="glass-input mt-1 w-full !rounded-lg !py-2 !text-sm" value={otherReason} maxLength={350} onChange={(event) => setOtherReason(event.target.value)} placeholder="Explain what needs correction" /></label> : <p className="self-end text-xs text-rose-800">The member will see this reason and can correct and resubmit the record.</p>}
                <button type="button" onClick={() => void runReviewAction(payment, "reject")} className="self-end rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white">Confirm rejection</button>
              </div> : null}
            </article>)}
          </div>}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--dash-border)] px-4 py-3 text-xs text-[var(--muted)] sm:px-5"><span>Page {page} of {totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loadingPayments} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-full border border-[var(--dash-border)] px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={page >= totalPages || loadingPayments} onClick={() => setPage((current) => current + 1)} className="rounded-full border border-[var(--dash-border)] px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
        </section>
      </>}
    </div>
  );
}
