import Link from "next/link";

export default function ResetPasswordPage() {
  return <main className="flex min-h-screen items-center justify-center p-6"><section className="glass-panel max-w-lg p-8 text-center"><h1 className="text-2xl font-semibold">This recovery link is no longer valid</h1><p className="mt-3 text-sm text-[var(--muted)]">ChamaPulse has moved password recovery to its secure sign-in provider. Request a fresh recovery code from the sign-in page.</p><div className="mt-6 flex justify-center gap-5"><Link className="font-semibold text-[var(--button-bg)] underline" href="/member-login">Member sign in</Link><Link className="font-semibold text-[var(--button-bg)] underline" href="/moderator-login">Moderator sign in</Link></div></section></main>;
}
