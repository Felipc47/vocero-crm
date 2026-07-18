"use client";

import { useEffect } from "react";

/**
 * Slide-over de 440px del mock SEOMOS: overlay con fade + panel derecho que
 * entra deslizándose. Cierra con clic en el overlay o Escape.
 */
export function SlideOver({
  onClose,
  children,
  ariaLabel,
}: {
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 animate-[fade-in_.18s_ease] bg-black/40"
        onClick={onClose}
        role="presentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className="fixed bottom-0 right-0 top-0 z-40 flex w-full animate-[slide-in-right_.26s_cubic-bezier(.2,.8,.2,1)] flex-col border-l bg-surface shadow-[-16px_0_44px_rgba(0,0,0,.22)] sm:w-[440px] sm:max-w-[92vw]"
      >
        {children}
      </div>
    </>
  );
}
