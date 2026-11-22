"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthShell from "@/components/AuthShell";
import Link from "next/link";

type ModeratorSetup = {
  groupName: string;
  description: string;
  contributionAmount: string;
  frequency: string;
  numberOfMembers: string;
  startDate: string;
  currency: string;
};

const setupStorageKey = "chamapulse-pending-moderator-signup";

const emptyModeratorSetup = (): ModeratorSetup => ({
  groupName: "",
  description: "",
  contributionAmount: "",
  frequency: "monthly",
  numberOfMembers: "5",
  startDate: new Date().toISOString().slice(0, 10),
  currency: "KES",
});

function readModeratorSetup(): ModeratorSetup | null {
  try {
    const raw = localStorage.getItem(setupStorageKey) ?? sessionStorage.getItem(setupStorageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ModeratorSetup>;
    if (typeof value.groupName !== "string" || typeof value.contributionAmount !== "string" || typeof value.startDate !== "string") return null;
    return { ...emptyModeratorSetup(), ...value };
  } catch {
    return null;
  }
}

function verificationMessage(code: string | null) {
  switch (code?.toUpperCase()) {
    case "TOKEN_EXPIRED": return "This verification link has expired. Request a new email below.";
    case "INVALID_TOKEN": return "This verification link is invalid or has already been used. Request a new email, or sign in if your email is already verified.";
    case "USER_NOT_FOUND": return "We couldn't find an account for this link. Check the email address or create an account again.";
    case "INVALID_USER": return "This link belongs to a different account. Sign in with the email address that received it.";
    default: return "We couldn't verify this link. Request a new email or sign in if your email is already verified.";
  }
}

function CompleteSignupContent() {
  const { data: session, isPending } = authClient.useSession();
  const params = useSearchParams();
  const router = useRouter();
  const handled = useRef(false);
  const role = params.get("role") === "moderator" ? "moderator" : "member";
  const verificationError = params.get("error");
  const verificationSucceeded = params.get("verified") === "1";
  const [state, setState] = useState<"checking" | "finishing" | "group-details" | "signed-out" | "verification-failed" | "error">("checking");
  const [groupSetup, setGroupSetup] = useState<ModeratorSetup>(emptyModeratorSetup);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionDelayed, setSessionDelayed] = useState(false);
  const [sessionRetry, setSessionRetry] = useState(0);

  const loginHref = `/moderator-login?callbackUrl=${encodeURIComponent(`/auth/complete-signup?role=${role}`)}`;

  const finishSignup = useCallback(async (body: ModeratorSetup | Record<string, never>) => {
    if (role !== "moderator") {
      setState("error");
      setError("Members can finish account setup only through their secure invitation link.");
      return;
    }
    setState("finishing");
    setError("");
    setBusy(true);
    try {
      const endpoint = "/api/chama/moderator-signup";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 401) {
        setState("signed-out");
        setError("Your email is verified, but this browser needs you to sign in before setup can continue.");
        return;
      }
      const data = await response.json().catch(() => ({})) as { groupId?: string; error?: string };
      if (!response.ok) {
        if (response.status === 400 && role === "moderator" && typeof data.error === "string") {
          setState("group-details");
          setError(data.error);
          return;
        }
        if (response.status === 409 && role === "moderator") {
          setState("group-details");
          setError(data.error ?? "Group setup is already in progress. Wait a moment, then try again.");
          return;
        }
        setError("We couldn't finish setting up your account. Your details are still here. Please try again.");
        setState("error");
        return;
      }
      try {
        localStorage.removeItem(setupStorageKey);
        sessionStorage.removeItem(setupStorageKey);
      } catch {
        // Storage is optional; the account setup has already completed.
      }
      router.replace(role === "moderator" ? `/moderator/onboarding?groupId=${encodeURIComponent(data.groupId ?? "")}` : "/chama");
      router.refresh();
    } catch {
      setState("error");
      setError("We couldn't reach the server to finish setup. Your details are still here. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [role, router]);

  useEffect(() => {
    if (!isPending || state !== "checking") return;
    const timer = window.setTimeout(() => setSessionDelayed(true), 12000);
    return () => window.clearTimeout(timer);
  }, [isPending, state]);

  useEffect(() => {
    if (isPending || handled.current) return;
    handled.current = true;
    if (role !== "moderator") return;
    const resolve = async () => {
      let activeUser = session?.user;
      let signedIn = Boolean(activeUser);
      if (!signedIn) {
        try {
          const fresh = await authClient.getSession({ query: { disableCookieCache: true } });
          activeUser = fresh.data?.user;
          signedIn = Boolean(activeUser);
        } catch {
          signedIn = false;
        }
      }
      if (!signedIn) {
        setState(verificationError ? "verification-failed" : "signed-out");
        return;
      }

      setEmail(activeUser?.email ?? "");
      if ((activeUser as ({ emailVerified?: boolean } | undefined))?.emailVerified !== true) {
        setState("verification-failed");
        return;
      }
      const appRole = (activeUser as ({ appRole?: string } | undefined))?.appRole ?? "member";
      if (role === "moderator" && appRole.split(",").map((value) => value.trim()).includes("moderator")) {
        router.replace("/chama");
        router.refresh();
        return;
      }
      if (role === "moderator") {
        const saved = readModeratorSetup();
        if (!saved) {
          setGroupSetup(emptyModeratorSetup());
          setState("group-details");
          return;
        }
        setGroupSetup(saved);
        await finishSignup(saved);
        return;
      }
      await finishSignup({});
    };
    void resolve();
  }, [isPending, session, role, router, verificationError, sessionRetry, finishSignup]);

  const resendVerification = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address that received the link.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await authClient.sendVerificationEmail({ email: normalizedEmail, callbackURL: `/auth/complete-signup?role=${role}&verified=1` });
      if (result.error) throw new Error("send failed");
      setMessage("If this address needs verification, a new email is on its way. Check your inbox and spam folder.");
    } catch {
      setError("We couldn't send a new verification email. Wait a moment and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitModeratorSetup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!groupSetup.groupName.trim()) {
      setError("Enter a group name.");
      return;
    }
    if (!Number.isFinite(Number(groupSetup.contributionAmount)) || Number(groupSetup.contributionAmount) < 1) {
      setError("Enter a contribution amount of at least 1.");
      return;
    }
    try {
      localStorage.setItem(setupStorageKey, JSON.stringify(groupSetup));
    } catch {
      // The form remains in memory and is submitted directly below.
    }
    await finishSignup(groupSetup);
  };

  if (role !== "moderator") {
    return <AuthShell eyebrow="Member account setup" title="Use your group's invitation." subtitle="Members activate an account from a personal setup link sent by their moderator." brandTitle="Member access" brandSubtitle="Your moderator controls member invitations." brandPoints={["The invitation is linked to your member record.", "Create your password from that secure link.", "Email verification protects your access."]}><Link className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white" href="/member-login">Go to member sign in</Link></AuthShell>;
  }

  if (state === "checking" || state === "finishing") {
    return <AuthShell eyebrow="Moderator account setup" title={state === "checking" && session?.user?.emailVerified ? "Your email is verified." : state === "checking" ? "Checking your account." : "Finishing your secure setup."} subtitle={state === "checking" ? "This usually takes a few seconds." : "Please keep this page open while your group workspace is prepared."} brandTitle="Secure account setup" brandSubtitle="Email verification protects your moderator account." brandPoints={["Your group details stay connected.", "Your email address must be verified.", "You can retry without creating another account."]}><div role="status" className="auth-alert auth-alert--info"><LoaderCircle className="mr-2 inline animate-spin" size={17} />{state === "finishing" ? "Finishing your secure setup…" : "Checking your account…"}</div>{sessionDelayed && state === "checking" ? <div className="mt-4"><p className="auth-alert auth-alert--error">We could not confirm your sign-in yet.</p><button type="button" className="mt-4 font-semibold text-[var(--accent)] underline" onClick={() => { handled.current = false; setSessionDelayed(false); setState("checking"); setSessionRetry((value) => value + 1); }}>Try again</button></div> : null}</AuthShell>;
  }

  if (state === "group-details" || (state === "error" && role === "moderator")) {
    return <AuthShell eyebrow="Moderator account setup" title={state === "error" ? "Setup needs another try." : "Your email is verified."} subtitle="Finish creating your group. If you opened the email on another device, add the group details here and continue." brandTitle="Your group workspace" brandSubtitle="Set up your group and start managing it with ChamaPulse." brandPoints={["Set contribution timing and currency.", "Invite members after setup.", "Your account remains secure."]}><form onSubmit={(event) => void submitModeratorSetup(event)} className="space-y-4">
      <label className="block space-y-1.5 text-sm font-medium">Group name<input className="glass-input w-full" value={groupSetup.groupName} onChange={(event) => setGroupSetup({ ...groupSetup, groupName: event.target.value })} required maxLength={120} /></label>
      <label className="block space-y-1.5 text-sm font-medium">Description <span className="font-normal text-[var(--muted)]">(optional)</span><input className="glass-input w-full" value={groupSetup.description} onChange={(event) => setGroupSetup({ ...groupSetup, description: event.target.value })} maxLength={500} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">Contribution amount<input className="glass-input w-full" type="number" min="1" step="0.01" value={groupSetup.contributionAmount} onChange={(event) => setGroupSetup({ ...groupSetup, contributionAmount: event.target.value })} required /></label>
        <label className="block space-y-1.5 text-sm font-medium">Frequency<select className="glass-input w-full" value={groupSetup.frequency} onChange={(event) => setGroupSetup({ ...groupSetup, frequency: event.target.value })}><option value="weekly">Weekly</option><option value="bi-weekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
        <label className="block space-y-1.5 text-sm font-medium">Expected members<input className="glass-input w-full" type="number" min="1" max="10000" value={groupSetup.numberOfMembers} onChange={(event) => setGroupSetup({ ...groupSetup, numberOfMembers: event.target.value })} /></label>
        <label className="block space-y-1.5 text-sm font-medium">Start date<input className="glass-input w-full" type="date" value={groupSetup.startDate} onChange={(event) => setGroupSetup({ ...groupSetup, startDate: event.target.value })} required /></label>
        <label className="block space-y-1.5 text-sm font-medium">Currency<select className="glass-input w-full" value={groupSetup.currency} onChange={(event) => setGroupSetup({ ...groupSetup, currency: event.target.value })}><option value="KES">KES</option><option value="USD">USD</option><option value="UGX">UGX</option><option value="TZS">TZS</option></select></label>
      </div>
      {error ? <p role="alert" className="auth-alert auth-alert--error">{error}</p> : null}
      <button disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Creating your group…" : "Create group and continue"}</button>
    </form></AuthShell>;
  }

  if (state === "verification-failed") {
    return <AuthShell eyebrow="Email verification" title="Check your email verification." subtitle="Verify your address to finish setting up your moderator account." brandTitle="Verify your email" brandSubtitle="A verified address helps protect your account and group records." brandPoints={["Verification links expire after one hour.", "You can request a fresh email below.", "Sign in after verification to continue."]}><p role="alert" className="auth-alert auth-alert--error">{verificationMessage(verificationError)}</p><form onSubmit={(event) => { event.preventDefault(); void resendVerification(); }} className="mt-5 space-y-3"><label htmlFor="verification-email" className="block space-y-1.5 text-sm font-medium">Email address<input id="verification-email" className="glass-input w-full" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value.trimStart())} required maxLength={254} /></label>{error ? <p role="alert" className="auth-alert auth-alert--error">{error}</p> : null}{message ? <p role="status" className="auth-alert auth-alert--success">{message}</p> : null}<button disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Sending verification email…" : "Resend verification email"}</button></form><p className="mt-5 text-center text-sm text-[var(--muted)]">Already verified? <Link className="font-semibold text-[var(--accent)] underline" href={loginHref}>Sign in</Link></p></AuthShell>;
  }

  return <AuthShell eyebrow="Moderator account setup" title={state === "signed-out" ? (verificationSucceeded ? "Your email is verified." : "Continue to your account.") : "Setup needs another try."} subtitle={error || (state === "signed-out" ? (verificationSucceeded ? "Sign in on this browser to continue." : "Sign in to continue. If you are unsure whether your email was verified, request a fresh link below.") : "Your account is safe. Retry setup without creating another account.")} brandTitle="Secure account setup" brandSubtitle="Your email and group setup are connected to your moderator account." brandPoints={["Verify your email to finish setup.", "Your group details are saved when possible.", "You can return and retry safely."]}>{state === "signed-out" && !verificationSucceeded ? <form onSubmit={(event) => { event.preventDefault(); void resendVerification(); }} className="space-y-3"><label htmlFor="resend-email" className="block space-y-1.5 text-sm font-medium">Email address<input id="resend-email" className="glass-input w-full" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value.trimStart())} required maxLength={254} /></label>{error ? <p role="alert" className="auth-alert auth-alert--error">{error}</p> : null}{message ? <p role="status" className="auth-alert auth-alert--success">{message}</p> : null}<button disabled={busy} className="w-full rounded-xl border border-[var(--glass-border-strong)] px-5 py-3 text-sm font-semibold text-[var(--accent)] disabled:opacity-60">{busy ? "Sending verification email…" : "Resend verification email"}</button></form> : null}<Link className="mt-5 block text-center font-semibold text-[var(--accent)] underline underline-offset-2" href={loginHref}>Sign in to continue</Link></AuthShell>;
}

export default function CompleteSignupPage() {
  return <Suspense fallback={<AuthShell eyebrow="Moderator account setup" title="Loading your account." subtitle="Checking your secure verification state." brandTitle="Secure account setup" brandSubtitle="Your email and group setup are connected." brandPoints={["Verify your email to continue.", "Your group details are saved.", "You can retry safely."]}><p role="status" className="auth-alert auth-alert--info">Loading your account…</p></AuthShell>}><CompleteSignupContent /></Suspense>;
}
