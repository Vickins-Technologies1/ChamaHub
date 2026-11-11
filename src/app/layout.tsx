import type { Metadata } from "next";
import { Inter, Instrument_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-dashboard" });
const display = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "ChamaHub", template: "%s | ChamaHub" },
  description: "Manage chama groups, contributions, meetings, and payouts with ChamaHub.",
  icons: { icon: "/chamahub-mark.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className={`${inter.variable} ${instrument.variable} ${display.variable}`}>{children}</body></html>;
}
