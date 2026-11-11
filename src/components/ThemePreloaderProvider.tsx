
"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import Preloader from "./Preloader";

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function syncFavicon(theme: "light" | "dark") {
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    if (href.includes("/favicon-light-") || href.includes("/favicon-dark-")) {
      link.media = href.includes(`/favicon-${theme}-`) ? "all" : "not all";
    }
  });
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemePreloaderProvider");
  }
  return context;
}

interface ThemePreloaderProviderProps {
  children: ReactNode;
}

export default function ThemePreloaderProvider({ children }: ThemePreloaderProviderProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isPreloaderVisible, setIsPreloaderVisible] = useState(true);

  // Use the saved choice, or follow the operating system until the user picks a theme.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const savedTheme = localStorage.getItem("theme");
      const theme = savedTheme === "dark" || (savedTheme !== "light" && media.matches) ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
      syncFavicon(theme);
      setIsDarkMode(theme === "dark");
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, []);

  // Hide preloader after 2 seconds
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
    const timer = setTimeout(() => {
      setIsPreloaderVisible(false);
    }, prefersReduced ? 250 : 900);

    return () => clearTimeout(timer);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const newTheme = prev ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      syncFavicon(newTheme);
      localStorage.setItem("theme", newTheme);
      return !prev;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {isPreloaderVisible && <Preloader isDarkMode={isDarkMode} />}
      {children}
    </ThemeContext.Provider>
  );
}
