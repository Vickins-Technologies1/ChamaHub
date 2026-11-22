"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";
import { authClient } from "@/lib/auth-client";

type InvitationState = "checking" | "valid" | "invalid" | "claiming" | "claimed" | "claim-error";
type RegistrationMode = "create" | "sign-in";
const pendingAdminInviteKey = "chp-admin-invite-id";

export default function AdminInvitePage() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [invitationState, setInvitationState] = useState<InvitationState>("checking");
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("create");
  const [verificationReturned, setVerificationReturned] = useState(false);
  const [emailHint, setEmailHint] = useState("");
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    const verified = new URLSearchParams(window.location.search).get("verified") === "1";
    const fragmentValues = new URLSearchParams(window.location.hash.slice(1));
    const queryInviteId = new URLSearchParams(window.location.search).get("inviteId") ?? "";
    if (verified) {
      setRegistrationMode("sign-in");
      setVerificationReturned(true);
    }
    const fragmentToken = fragmentValues.get("token");
    const fragmentInviteId = fragmentValues.get("inviteId") ?? "";
    // Existing invitations were issued with a query token; accept them once, then remove it immediately.
    const value = fragmentToken ?? new URLSearchParams(window.location.search).get("token") ?? "";
    let savedInviteId = fragmentInviteId || queryInviteId;
    try {
      savedInviteId ||= window.sessionStorage.getItem(pendingAdminInviteKey) ?? "";
      if (value) window.sessionStorage.removeItem(pendingAdminInviteKey);
    } catch {
      // The original invitation link can still be checked without session storage.
    }
    if (!value && !savedInviteId) {
      setInvitationState("invalid");
      setError("This invitation link is missing its secure token. Ask the administrator to send a new invitation.");
      return;
    }
    setToken(value);
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      try {
        const response = await fetch("/api/admin/invitations/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value ? { action: "inspect", token: value } : { action: "inspect", inviteId: savedInviteId }),
        });
        const result = await response.json().catch(() => ({})) as { emailHint?: string; inviteId?: string };
        if (!response.ok) throw new Error("This invitation is invalid, expired, or has already been used. Ask the administrator to send a new invitation.");
        setEmailHint(result.emailHint ?? "the invited email address");
        const id = result.inviteId ?? savedInviteId;
        if (!id) throw new Error("This invitation could not be checked. Ask the administrator to send a new invitation.");
        setInviteId(id);
        try { window.sessionStorage.setItem(pendingAdminInviteKey, id); } catch { /* In-memory sign-in can still accept this invitation. */ }
        if (verified || !value) setRegistrationMode("sign-in");
        setInvitationState("valid");
      } catch (cause) {
        setInvitationState("invalid");
        setError(cause instanceof Error ? cause.message : "We couldn't check this invitation. Please try again.");
      }
    })();
  }, []);

  useEffect(() => {
    if (isPending || !session?.user || invitationState !== "valid" || !inviteId || started.current) return;
    started.current = true;
    setInvitationState("claiming");
    void (async () => {
      try {
        const response = await fetch("/api/admin/invitations/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteId }),
        });
        if (!response.ok) {
          setError(response.status === 403
            ? "Sign in with the verified email address that received this invitation."
            : response.status === 410 || response.status === 409
              ? "This invitation has expired or has already been used. Ask the administrator for help."
              : "We couldn't finish accepting this invitation. Please try again.");
          setInvitationState("claim-error");
          started.current = false;
          return;
        }
        try { window.sessionStorage.removeItem(pendingAdminInviteKey); } catch { /* The invitation was accepted already. */ }
        setInvitationState("claimed");
        router.replace("/admin");
        router.refresh();
      } catch {
        setError("We couldn't reach the server to accept your invitation. Check your connection and try again.");
        setInvitationState("claim-error");
        started.current = false;
      }
    })();
  }, [isPending, session, invitationState, inviteId, router]);

  const callback = inviteId ? `/auth/admin-invite#inviteId=${encodeURIComponent(inviteId)}` : "/auth/admin-invite";
  const verificationCallbackUrl = inviteId ? `/auth/admin-invite?verified=1#inviteId=${encodeURIComponent(inviteId)}` : "/auth/admin-invite";

  if (invitationState === "checking" || invitationState === "claiming" || (isPending && session?.user)) {
    return <AuthShell eyebrow="Administrator invitation" title="Checking your secure invitation." subtitle="We are verifying the invitation and preparing the right next step." brandTitle="Secure staff access" brandSubtitle="Administrative access is tied to a one-time invitation." brandPoints={["Your invited email must be verified.", "Each invitation can be accepted once.", "Access is granted after the invitation is claimed."]}>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-muted)] p-4 text-sm text-[var(--muted)]" role="status"><LoaderCircle size={18} className="animate-spin text-[var(--accent)]" />{invitationState === "claiming" ? "Activating your administrator access…" : "Checking invitation…"}</div>
    </AuthShell>;
  }

  if (invitationState === "claimed") {
    return <AuthShell eyebrow="Administrator invitation" title="Your access is ready." subtitle="Opening your ChamaPulse administrator workspace." brandTitle="Secure staff access" brandSubtitle="Your invitation has been accepted." brandPoints={["Your access is ready.", "This invitation is now closed.", "Your administrator workspace is loading."]}><div role="status" className="auth-alert auth-alert--success">Access granted. Taking you to the administrator workspace…</div></AuthShell>;
  }

  if (invitationState === "invalid") {
    return <AuthShell eyebrow="Administrator invitation" title="Invitation needs attention." subtitle="This invitation cannot be used to create or access an account." brandTitle="Secure staff access" brandSubtitle="Invitations are valid for seven days and can be used once." brandPoints={["Contact the administrator who invited you.", "Ask them to check or resend the invitation.", "Your account is safe while this is resolved."]}>
      <div role="alert" className="auth-alert auth-alert--error">{error}</div>
      <Link href="/" className="mt-5 inline-flex font-semibold text-[var(--accent)] underline underline-offset-2">Return home</Link>
    </AuthShell>;
  }

  return <AuthShell eyebrow="Administrator invitation" title={registrationMode === "create" ? "Set up your invited account." : "Sign in to accept your invitation."} subtitle={verificationReturned ? `Your email is verified. Sign in with ${emailHint} to finish accepting the invitation.` : `Use the invited email address (${emailHint}) to continue. Verify your email before access is activated.`} brandTitle="Secure staff access" brandSubtitle="Administrative access is tied to a one-time invitation." brandPoints={["Your invited email must be verified.", "Each invitation can be accepted once.", "Access is granted only after claim."]}>
    {invitationState === "claim-error" ? <div className="mb-5 space-y-3"><p role="alert" className="auth-alert auth-alert--error">{error}</p>{session?.user ? <button type="button" onClick={() => { void authClient.signOut().then(() => { window.history.replaceState(null, "", `${window.location.pathname}#inviteId=${encodeURIComponent(inviteId)}`); window.location.reload(); }); }} className="w-full rounded-xl border border-[var(--glass-border-strong)] px-4 py-3 text-sm font-semibold text-[var(--accent)]">Sign out and use the invited email</button> : null}</div> : null}
    <div className="mb-5 grid grid-cols-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface-muted)] p-1" role="group" aria-label="Choose account action">
      <button type="button" disabled={!token} onClick={() => { setRegistrationMode("create"); setError(""); }} aria-pressed={registrationMode === "create"} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${registrationMode === "create" ? "bg-[var(--glass-surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}>Create account</button>
      <button type="button" onClick={() => { setRegistrationMode("sign-in"); setError(""); }} aria-pressed={registrationMode === "sign-in"} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${registrationMode === "sign-in" ? "bg-[var(--glass-surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]"}`}>I have an account</button>
    </div>
    <AuthForm mode={registrationMode === "create" ? "sign-up" : "sign-in"} role="admin" invitationToken={token || undefined} verificationCallbackUrl={verificationCallbackUrl} nextPath={callback} showModeLinks={false} />
    <p className="mt-5 text-center text-xs leading-5 text-[var(--muted)]"><ShieldCheck size={14} className="mr-1 inline" aria-hidden="true" />The administrator invitation is checked before account creation and access is activated only after email verification.</p>
  </AuthShell>;
}
