"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import BrandLogo from "./BrandLogo";

interface PreloaderProps {
  isDarkMode: boolean;
}

export default function Preloader({ isDarkMode }: PreloaderProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    let exitTimer = 0;
    let isDismissing = false;

    const dismiss = () => {
      if (cancelled || isDismissing) return;
      isDismissing = true;
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (cancelled) return;
          setIsLeaving(true);
          exitTimer = window.setTimeout(() => setIsVisible(false), reduceMotion ? 0 : 520);
        });
      });
    };

    const fallbackTimer = window.setTimeout(dismiss, 1600);
    const onFontsSettled = () => {
      window.clearTimeout(fallbackTimer);
      dismiss();
    };
    void Promise.resolve(document.fonts?.ready).then(onFontsSettled, onFontsSettled);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(exitTimer);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [reduceMotion]);

  if (!isVisible) return null;

  return (
    <div
      className={`pulse-preloader${isDarkMode ? " pulse-preloader--dark" : ""}${isLeaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Preparing your financial workspace"
      aria-hidden={isLeaving}
    >
      <div className="pulse-preloader__ambient" aria-hidden="true" />
      <div className="pulse-preloader__panel">
        <div className="pulse-preloader__scene" aria-hidden="true">
          <span className="pulse-preloader__orbit pulse-preloader__orbit--outer" />
          <span className="pulse-preloader__orbit pulse-preloader__orbit--inner" />
          <span className="pulse-preloader__satellite pulse-preloader__satellite--one" />
          <span className="pulse-preloader__satellite pulse-preloader__satellite--two" />
          <span className="pulse-preloader__satellite pulse-preloader__satellite--three" />
          <span className="pulse-preloader__core-back" />
          <div className="pulse-preloader__core">
            <BrandLogo size={64} priority className="pulse-preloader__logo" />
          </div>
        </div>

        <p className="pulse-preloader__brand">ChamaPulse</p>
        <p className="pulse-preloader__message">Preparing your financial workspace</p>
        <div className="pulse-preloader__progress" aria-hidden="true">
          <span />
        </div>
        <p className="pulse-preloader__footnote">Bringing your group into focus</p>
      </div>
    </div>
  );
}
