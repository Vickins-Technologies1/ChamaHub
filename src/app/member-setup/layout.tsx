import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set up your ChamaPulse account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function MemberSetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
