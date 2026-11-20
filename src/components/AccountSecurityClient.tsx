"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { KeyRound, LoaderCircle, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type SessionItem = { id: string; token: string; createdAt: Date | string; updatedAt: Date | string; expiresAt: Date | string; ipAddress?: string | null; userAgent?: string | null };

function friendlyError(error: unknown) {
  return error instanceof Error ? error.message : "We could not update your security settings.";
}

export default function AccountSecurityClient() {
  const { data: session, isPending } = authClient.useSession();
  const [devices, setDevices] = useState<SessionItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [qr, setQr] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const appUser = session?.user as ({ twoFactorEnabled?: boolean } | undefined);

  const loadDevices = useCallback(async () => {
    const result = await authClient.listSessions();
    if (result.data) setDevices(result.data as SessionItem[]);
    else if (result.error) setError(result.error.message || "Unable to load signed-in devices.");
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);
  useEffect(() => {
    if (!totpUri) { setQr(""); return; }
    let active = true;
    void QRCode.toDataURL(totpUri, { errorCorrectionLevel: "M", margin: 1, width: 220 }).then((data) => { if (active) setQr(data); }).catch(() => setError("The authenticator QR code could not be generated."));
    return () => { active = false; };
  }, [totpUri]);

  const enableTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true); setError(""); setMessage("");
    try {
      const result = await authClient.twoFactor.enable({ password, method: "totp", issuer: "ChamaPulse" });
      if (result.error) throw new Error(result.error.message || "Could not start authenticator setup.");
      if (!result.data || result.data.method !== "totp") throw new Error("The authenticator setup did not return a provisioning code.");
      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes ?? []);
      setMessage("Scan this QR code with an authenticator app, then verify a current code to finish setup.");
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPending(false); }
  };

  const verifyTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: totpCode.trim() });
      if (result.error) throw new Error(result.error.message || "That code was not accepted.");
      setTotpUri(""); setTotpCode(""); setPassword(""); setMessage("Authenticator verification is enabled for this account.");
      await authClient.getSession({ query: { disableCookieCache: true } });
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPending(false); }
  };

  const disableTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const result = await authClient.twoFactor.disable({ password });
      if (result.error) throw new Error(result.error.message || "Could not disable two-step verification.");
      setPassword(""); setBackupCodes([]); setMessage("Two-step verification is disabled.");
      window.location.reload();
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPending(false); }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setError("The passwords do not match."); return; }
    setPending(true); setError(""); setMessage("");
    try {
      const result = await authClient.changePassword({ currentPassword: password, newPassword, revokeOtherSessions: true });
      if (result.error) throw new Error(result.error.message || "The current password was not accepted.");
      setPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("Password changed. Other devices were signed out.");
      await loadDevices();
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPending(false); }
  };

  const revokeDevice = async (token: string) => {
    setPending(true); setError("");
    try {
      const result = await authClient.revokeSession({ token });
      if (result.error) throw new Error(result.error.message || "Could not revoke that session.");
      await loadDevices();
      setMessage("Device session revoked.");
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPending(false); }
  };

  const revokeOtherDevices = async () => {
    setPending(true); setError("");
    try {
      const result = await authClient.revokeOtherSessions();
      if (result.error) throw new Error(result.error.message || "Could not sign out other devices.");
      await loadDevices(); setMessage("Other device sessions were revoked.");
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPending(false); }
  };

  const generateBackupCodes = async () => {
    setPending(true); setError("");
    try {
      const result = await authClient.twoFactor.generateBackupCodes({ password });
      if (result.error) throw new Error(result.error.message || "Could not generate backup codes.");
      setBackupCodes(result.data?.backupCodes ?? []); setMessage("Save these one-time backup codes somewhere safe. They are shown only here.");
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setPending(false); }
  };

  if (isPending) return <div className="glass-panel flex min-h-40 items-center justify-center p-6 text-sm text-[var(--muted)]"><LoaderCircle size={18} className="mr-2 animate-spin" />Loading account security…</div>;
  if (!session?.user) return <div className="glass-panel p-6">Sign in to manage account security.</div>;

  return <div className="space-y-5">
    <header><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Account</p><h1 className="mt-1 text-2xl font-semibold">Security and devices</h1><p className="mt-1 text-sm text-[var(--muted)]">{session.user.email} · {session.user.emailVerified ? "Verified email" : "Email verification required"}</p></header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <section className="glass-panel p-5"><div className="flex items-center gap-3"><ShieldCheck className="text-[var(--button-bg)]" size={20} /><div><h2 className="font-semibold">Two-step verification</h2><p className="text-xs text-[var(--muted)]">Authenticator app and single-use recovery codes</p></div><span className="ml-auto rounded-full border px-3 py-1 text-xs">{appUser?.twoFactorEnabled ? "Enabled" : "Not enabled"}</span></div>
      {appUser?.twoFactorEnabled ? <form onSubmit={disableTwoFactor} className="mt-4 flex flex-col gap-3 sm:flex-row"><input className="glass-input flex-1" type="password" autoComplete="current-password" placeholder="Confirm your password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button disabled={pending} className="dashboard-export-button">Disable two-step verification</button><button disabled={pending || !password} type="button" onClick={() => void generateBackupCodes()} className="dashboard-export-button">Generate backup codes</button></form> : <form onSubmit={enableTwoFactor} className="mt-4 flex flex-col gap-3 sm:flex-row"><input className="glass-input flex-1" type="password" autoComplete="current-password" placeholder="Confirm your password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button disabled={pending} className="dashboard-export-button">Set up authenticator</button></form>}
      {totpUri && <div className="mt-5 grid gap-5 rounded-xl border border-[var(--dash-border)] p-4 sm:grid-cols-[220px_1fr]"><div>{qr && <Image src={qr} alt="Local authenticator QR code" width={220} height={220} unoptimized className="h-[220px] w-[220px] rounded-lg bg-white p-2" />}<p className="mt-2 break-all text-[10px] text-[var(--muted)]">Manual key: {totpUri}</p></div><form onSubmit={verifyTwoFactor} className="space-y-3"><h3 className="font-semibold">Verify authenticator</h3><label className="block text-sm">6-digit code<input className="glass-input mt-2 w-full" inputMode="numeric" autoComplete="one-time-code" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} required maxLength={8} /></label><button disabled={pending} className="dashboard-export-button">Verify and enable</button></form></div>}
      {backupCodes.length > 0 && <div className="mt-4 rounded-xl bg-amber-50 p-4"><h3 className="font-semibold text-amber-950">One-time backup codes</h3><div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">{backupCodes.map((code) => <code key={code}>{code}</code>)}</div></div>}
    </section>
    <section className="glass-panel p-5"><div className="flex items-start gap-3"><KeyRound size={20} className="text-[var(--button-bg)]" /><div><h2 className="font-semibold">Change password</h2><p className="text-xs text-[var(--muted)]">Use at least 12 characters. Other sessions will be revoked.</p></div></div><form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-3"><input className="glass-input" type="password" autoComplete="current-password" placeholder="Current password" value={password} onChange={(event) => setPassword(event.target.value)} required /><input className="glass-input" type="password" autoComplete="new-password" placeholder="New password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><input className="glass-input" type="password" autoComplete="new-password" placeholder="Confirm new password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><button disabled={pending} className="dashboard-export-button sm:col-span-3">Change password</button></form></section>
    <section className="glass-panel p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Monitor size={20} className="text-[var(--button-bg)]" /><div><h2 className="font-semibold">Signed-in devices</h2><p className="text-xs text-[var(--muted)]">Sessions expire after 14 days and refresh while active.</p></div></div><button disabled={pending || devices.length < 2} onClick={() => void revokeOtherDevices()} className="dashboard-export-button">Sign out other devices</button></div><div className="mt-4 divide-y divide-[var(--dash-border)]">{devices.map((device) => { const current = device.token === session.session.token; return <article key={device.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><Smartphone size={18} className="text-[var(--muted)]" /><div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{device.userAgent || "Browser session"}{current ? " · This device" : ""}</p><p className="mt-1 text-xs text-[var(--muted)]">IP {device.ipAddress || "unavailable"} · Signed in {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(device.createdAt))} · Expires {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(device.expiresAt))}</p></div>{!current && <button disabled={pending} onClick={() => void revokeDevice(device.token)} className="dashboard-export-button">Revoke</button>}</article>; })}{devices.length === 0 && <p className="py-5 text-sm text-[var(--muted)]">No active sessions were found.</p>}</div></section>
  </div>;
}
