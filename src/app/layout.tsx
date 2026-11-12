import type { Metadata } from "next";
import { Inter, Instrument_Sans, Space_Grotesk } from "next/font/google";
import ThemePreloaderProvider from "@/components/ThemePreloaderProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap", variable: "--font-dashboard" });
const display = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "ChamaHub", template: "%s | ChamaHub" },
  description: "Manage chama groups, contributions, meetings, and payouts with ChamaHub.",
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
