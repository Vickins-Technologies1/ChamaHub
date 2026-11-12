import type { Metadata } from "next";
import { Inter, Instrument_Sans, Space_Grotesk } from "next/font/google";
import ThemePreloaderProvider from "@/components/ThemePreloaderProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-dashboard" });
const display = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL("https://chamahub.vickinstechnologies.com"),
  title: { default: "ChamaHub | Savings groups, in sync", template: "%s | ChamaHub" },
  description: "Manage your savings group’s members, contributions, payouts, meetings and announcements in one organized ChamaHub workspace.",
  applicationName: "ChamaHub",
  keywords: ["chama", "savings group", "contributions", "payouts", "group finance", "Kenya"],
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ChamaHub",
    title: "ChamaHub | Savings groups, in sync",
    description: "Manage members, contributions, payouts and meetings in one organized savings-group workspace.",
    images: [{ url: "/chamahub-logo.png", width: 1254, height: 1254, alt: "ChamaHub" }],
  },
  twitter: {
    card: "summary",
    title: "ChamaHub | Savings groups, in sync",
    description: "A clear workspace for savings-group members, contributions, payouts and meetings.",
    images: ["/chamahub-logo.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${instrument.variable} ${display.variable}`}>
        <ThemePreloaderProvider>{children}</ThemePreloaderProvider>
      </body>
    </html>
  );
}
