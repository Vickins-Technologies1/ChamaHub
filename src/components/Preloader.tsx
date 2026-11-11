// src/components/Preloader.tsx
"use client";

import { useEffect, useState } from "react";
import BrandLogo from "./BrandLogo";

interface PreloaderProps {
  isDarkMode: boolean;
}

export default function Preloader({ isDarkMode }: PreloaderProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 3200);

    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  const bgColor = isDarkMode ? "#0b0f1a" : "#f6f8fc";
  const glowA = isDarkMode ? "rgba(59,130,246,0.28)" : "rgba(37,99,235,0.2)";
  const glowB = isDarkMode ? "rgba(45,212,191,0.22)" : "rgba(45,212,191,0.16)";
  const textPrimary = isDarkMode ? "text-white" : "text-[var(--foreground)]";
  const textMuted = isDarkMode ? "text-white/60" : "text-[var(--foreground)]/60";

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-700 ease-out ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="absolute inset-0" style={{ background: bgColor }} />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at top, ${glowA}, transparent 55%)` }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at bottom right, ${glowB}, transparent 60%)` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[80vw] max-w-4xl h-[60vh]">
          <div className="absolute inset-0 border border-white/10 rounded-[40px]" />
          <div className="absolute inset-0 rounded-[40px] backdrop-blur-2xl bg-white/5" />
          <div className="absolute inset-0 overflow-hidden rounded-[40px]">
            <div
              className="absolute -top-24 -left-20 w-72 h-72 blur-[80px] animate-orb"
              style={{ background: glowA }}
            />
            <div
              className="absolute -bottom-24 -right-16 w-72 h-72 blur-[80px] animate-orb-slow"
              style={{ background: glowB }}
            />
            <div
              className="absolute top-1/2 left-0 w-full h-[1px] animate-scan"
              style={{
                background: isDarkMode
                  ? "linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent)"
                  : "linear-gradient(to right, transparent, rgba(15,23,42,0.25), transparent)",
              }}
            />
          </div>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28">
              <div className="absolute inset-0 rounded-full border border-white/25 bg-white/10 backdrop-blur-xl" />
              <BrandLogo size={110} className="absolute inset-0 m-auto h-16 w-16 sm:h-20 sm:w-20" />
            </div>
            <p className={`text-[10px] uppercase tracking-[0.5em] ${textMuted} mt-6`}>
              ChamaHub
            </p>
            <h1 className={`text-2xl sm:text-3xl font-semibold ${textPrimary} mt-2`}>
              Crafting your experience
            </h1>
            <p className={`text-xs sm:text-sm ${textMuted} mt-2`}>
              Designing · Engineering · Launching
            </p>

            <div className="mt-8 flex items-center gap-3">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className="h-1.5 w-10 rounded-full"
                  style={{
                    background: isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(15,23,42,0.2)",
                    animation: `pulseBar 1.4s ease-in-out ${index * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulseBar {
          0%, 100% { opacity: 0.3; transform: scaleX(0.6); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        @keyframes scan {
          0% { transform: translateY(-120%); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(120%); opacity: 0; }
        }
        @keyframes orbFloat {
          0%, 100% { transform: translateY(0) translateX(0) scale(1); }
          50% { transform: translateY(-12px) translateX(8px) scale(1.05); }
        }
        .animate-scan {
          animation: scan 2.6s ease-in-out infinite;
        }
        .animate-orb {
          animation: orbFloat 6s ease-in-out infinite;
        }
        .animate-orb-slow {
          animation: orbFloat 8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
