"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeMap: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: ModalSize;
  children: React.ReactNode;
};

export default function Modal({ open, onClose, title, subtitle, size = "md", children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative w-full ${sizeMap[size]} glass-modal`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && (
              <h3 className="text-lg sm:text-xl font-semibold text-[var(--foreground)]">{title}</h3>
            )}
            {subtitle && <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full border border-[var(--glass-border)] bg-white/70 text-[var(--foreground)] hover:bg-white transition"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
