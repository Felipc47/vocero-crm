"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Check } from "lucide-react";

/**
 * Toast global del mock SEOMOS: pastilla oscura centrada abajo con check,
 * se auto-oculta a los 2.2s. Uso: const toast = useToast(); toast("Guardado").
 */
const ToastContext = createContext<(message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2200);
  }, []);

  return (
    <ToastContext.Provider value={fire}>
      {children}
      {message && (
        <div
          role="status"
          className="fixed bottom-[26px] left-1/2 z-[60] flex -translate-x-1/2 animate-[pop-in_.2s_ease] items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-[13.5px] font-bold text-background shadow-[0_12px_30px_rgba(0,0,0,.3)]"
        >
          <Check className="h-4 w-4" strokeWidth={2.6} />
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
