
"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

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

  // Use the saved choice, or follow the operating system until the user picks a theme.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const savedTheme = localStorage.getItem("theme");
      const theme = savedTheme === "dark" || (savedTheme !== "light" && media.matches) ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
      setIsDarkMode(theme === "dark");
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const newTheme = prev ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);
      return !prev;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
