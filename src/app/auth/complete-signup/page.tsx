"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

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

  const loginHref = `/member-login?callbackUrl=${encodeURIComponent(`/auth/complete-signup?role=${role}`)}`;

  const finishSignup = useCallback(async (body: ModeratorSetup | Record<string, never>) => {
    setState("finishing");
    setError("");
    setBusy(true);
    try {
      const endpoint = role === "moderator" ? "/api/chama/moderator-signup" : "/api/chama/member-signup";
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
        if (response.status === 409 && role === "member") {
          setError("This account already has moderator access. Sign in to continue.");
        } else {
          setError("We couldn't finish setting up your account. Your details are still here. Please try again.");
        }
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

  if (state === "checking" || state === "finishing") {
    return <main className="flex min-h-screen items-center justify-center p-6"><div className="glass-panel max-w-md p-8 text-center" role="status"><LoaderCircle className="mx-auto mb-4 animate-spin text-[var(--button-bg)]" size={28} /><h1 className="text-xl font-semibold">{state === "checking" && session?.user?.emailVerified ? "Your email is verified" : state === "checking" ? "Checking your account…" : "Finishing your secure setup…"}</h1><p className="mt-3 text-sm text-[var(--muted)]">{state === "checking" ? "This usually takes a few seconds." : "Please keep this page open."}</p>{sessionDelayed && state === "checking" ? <><p className="mt-4 text-sm text-rose-700">We could not confirm your sign-in yet.</p><button type="button" className="mt-4 font-semibold text-[var(--button-bg)] underline" onClick={() => { handled.current = false; setSessionDelayed(false); setState("checking"); setSessionRetry((value) => value + 1); }}>Try again</button></> : null}</div></main>;
  }

  if (state === "group-details" || (state === "error" && role === "moderator")) {
    return <main className="flex min-h-screen items-center justify-center p-4"><section className="glass-panel w-full max-w-xl p-6 sm:p-8"><h1 className="text-xl font-semibold">{state === "error" ? "Setup needs another try" : "Your email is verified"}</h1><p className="mt-2 text-sm text-[var(--muted)]">Finish creating your group. If you opened this email on another device, add the group details here and continue.</p><form onSubmit={(event) => void submitModeratorSetup(event)} className="mt-6 space-y-4">
      <label className="block space-y-1.5 text-sm font-medium">Group name<input className="glass-input w-full" value={groupSetup.groupName} onChange={(event) => setGroupSetup({ ...groupSetup, groupName: event.target.value })} required maxLength={120} /></label>
      <label className="block space-y-1.5 text-sm font-medium">Description <span className="font-normal text-[var(--muted)]">(optional)</span><input className="glass-input w-full" value={groupSetup.description} onChange={(event) => setGroupSetup({ ...groupSetup, description: event.target.value })} maxLength={500} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">Contribution amount<input className="glass-input w-full" type="number" min="1" step="0.01" value={groupSetup.contributionAmount} onChange={(event) => setGroupSetup({ ...groupSetup, contributionAmount: event.target.value })} required /></label>
        <label className="block space-y-1.5 text-sm font-medium">Frequency<select className="glass-input w-full" value={groupSetup.frequency} onChange={(event) => setGroupSetup({ ...groupSetup, frequency: event.target.value })}><option value="weekly">Weekly</option><option value="bi-weekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
        <label className="block space-y-1.5 text-sm font-medium">Expected members<input className="glass-input w-full" type="number" min="1" max="10000" value={groupSetup.numberOfMembers} onChange={(event) => setGroupSetup({ ...groupSetup, numberOfMembers: event.target.value })} /></label>
        <label className="block space-y-1.5 text-sm font-medium">Start date<input className="glass-input w-full" type="date" value={groupSetup.startDate} onChange={(event) => setGroupSetup({ ...groupSetup, startDate: event.target.value })} required /></label>
        <label className="block space-y-1.5 text-sm font-medium">Currency<select className="glass-input w-full" value={groupSetup.currency} onChange={(event) => setGroupSetup({ ...groupSetup, currency: event.target.value })}><option value="KES">KES</option><option value="USD">USD</option><option value="UGX">UGX</option><option value="TZS">TZS</option></select></label>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <button disabled={busy} className="w-full rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : "Create group and continue"}</button>
    </form></section></main>;
  }

  if (state === "verification-failed") {
    return <main className="flex min-h-screen items-center justify-center p-6"><section className="glass-panel w-full max-w-md p-8"><h1 className="text-xl font-semibold">Email verification needs attention</h1><p className="mt-3 text-sm text-rose-700">{verificationMessage(verificationError)}</p><form onSubmit={(event) => { event.preventDefault(); void resendVerification(); }} className="mt-5 space-y-3"><label className="block space-y-1.5 text-sm font-medium">Email address<input className="glass-input w-full" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}{message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}<button disabled={busy} className="w-full rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Sending…" : "Resend verification email"}</button></form><p className="mt-5 text-center text-sm text-[var(--muted)]">Already verified? <a className="font-semibold text-[var(--button-bg)] underline" href={loginHref}>Sign in</a></p></section></main>;
  }

  return <main className="flex min-h-screen items-center justify-center p-6"><section className="glass-panel w-full max-w-md p-8"><h1 className="text-center text-xl font-semibold">{state === "signed-out" ? (verificationSucceeded ? "Your email is verified" : "Continue to your account") : "Setup needs another try"}</h1><p className="mt-3 text-center text-sm text-[var(--muted)]">{error || (state === "signed-out" ? (verificationSucceeded ? "Sign in to continue on this browser." : "Sign in to continue. If you are unsure whether your email was verified, request a fresh link below.") : "Your account is safe. You can retry setup without creating another account.")}</p>{state === "error" && role === "member" ? <button type="button" disabled={busy} onClick={() => void finishSignup({})} className="mt-5 w-full rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">Try again</button> : null}{state === "signed-out" && !verificationSucceeded ? <form onSubmit={(event) => { event.preventDefault(); void resendVerification(); }} className="mt-5 space-y-3"><label className="block space-y-1.5 text-left text-sm font-medium">Email address<input className="glass-input w-full" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} /></label>{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}{message ? <p role="status" className="text-sm text-emerald-800">{message}</p> : null}<button disabled={busy} className="w-full rounded-full border border-[var(--glass-border)] px-5 py-3 text-sm font-semibold text-[var(--button-bg)] disabled:opacity-60">{busy ? "Sending…" : "Resend verification email"}</button></form> : null}<a className="mt-5 block text-center font-semibold text-[var(--button-bg)] underline" href={loginHref}>Sign in to continue</a></section></main>;
}

export default function CompleteSignupPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-6"><div className="glass-panel p-8 text-sm text-[var(--muted)]">Loading your account…</div></main>}><CompleteSignupContent /></Suspense>;
}
