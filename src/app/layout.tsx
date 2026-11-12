import type { Metadata } from "next";
import { Inter, Instrument_Sans, Space_Grotesk } from "next/font/google";
import ThemePreloaderProvider from "@/components/ThemePreloaderProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-dashboard" });
const display = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL("https://chamapulse.vickinstechnologies.com"),
  title: { default: "ChamaPulse | Your Group. One Financial Pulse.", template: "%s | ChamaPulse" },
  description: "ChamaPulse is a group savings and investment management platform for contributions, payouts, financial records and collective investments.",
  applicationName: "ChamaPulse",
  keywords: ["chama management system", "chama software", "chama contribution management", "group savings management software", "investment group management", "savings group platform", "table banking management system", "group financial management", "chama accounting software", "group contributions and payouts"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ChamaPulse",
    title: "ChamaPulse | Your Group. One Financial Pulse.",
    description: "A modern platform for managing savings groups, contributions, payouts and collective investments.",
    images: [{ url: "/chamapulse-logo.png", width: 1254, height: 1254, alt: "ChamaPulse" }],
  },
  twitter: {
    card: "summary",
    title: "ChamaPulse | Your Group. One Financial Pulse.",
    description: "A group savings and investment management platform for transparent records and payouts.",
    images: ["/chamapulse-logo.png"],
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
