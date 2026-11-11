import type { Metadata } from "next";
import ChamaLayout from "@/components/ChamaLayout";

export const metadata: Metadata = {
  title: "ChamaHub Workspace",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ChamaLayout>{children}</ChamaLayout>;
}
