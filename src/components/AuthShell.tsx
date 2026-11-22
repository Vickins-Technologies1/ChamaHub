"use client";

import Link from "next/link";
import { Home, Moon, Sun } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { useTheme } from "@/components/ThemePreloaderProvider";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  brandTitle: string;
  brandSubtitle: string;
  brandPoints: string[];
  children: React.ReactNode;
};

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  brandTitle,
  brandSubtitle,
  brandPoints,
  children,
}: AuthShellProps) {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <main className="auth-shell">
      <div className="auth-shell__bg" aria-hidden="true" />
      <div className="auth-shell__grid">
        <aside className="auth-shell__brand">
          <Link href="/" className="auth-shell__brand-link" aria-label="ChamaPulse home">
            <BrandLogo size={48} priority />
            <span>
              <span className="auth-shell__wordmark">ChamaPulse</span>
              <span className="auth-shell__brand-title">{brandTitle}</span>
            </span>
          </Link>
          <div className="auth-shell__brand-copy">
            <p className="auth-shell__brand-heading">{brandSubtitle}</p>
            <ul className="auth-shell__points">
              {brandPoints.map((point) => (
                <li key={point} className="auth-shell__bullet">
                  <span className="auth-shell__bullet-dot" aria-hidden="true" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="auth-shell__brand-footer">Secure access to your Chama workspace</p>
        </aside>

        <section className="auth-shell__form" aria-labelledby="auth-page-title">
          <div className="auth-shell__card">
            <header className="auth-shell__header">
              <Link href="/" className="auth-shell__mobile-brand" aria-label="ChamaPulse home">
                <BrandLogo size={30} />
                <span>ChamaPulse</span>
              </Link>
              <div className="auth-shell__toolbar">
                <button
                  type="button"
                  className="auth-shell__icon-button"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
                  title={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
                >
                  {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
                </button>
                <Link href="/" className="auth-shell__home-link">
                  <Home size={15} aria-hidden="true" />
                  <span>Home</span>
                </Link>
              </div>
            </header>
            <div className="auth-shell__intro">
              <p className="auth-shell__eyebrow"><BrandLogo size={19} />{eyebrow}</p>
              <h1 id="auth-page-title">{title}</h1>
              <p className="auth-shell__subtitle">{subtitle}</p>
            </div>
            <div className="auth-shell__content">{children}</div>
            <footer className="auth-shell__footer">Your account and group information stay protected.</footer>
          </div>
        </section>
      </div>
    </main>
  );
}
