"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Tema claro/oscuro. La clase `dark` en <html> la aplica el script anti-flash
 * del root layout antes del primer paint; aquí solo leemos ese estado inicial y
 * lo alternamos, persistiendo la preferencia en localStorage.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem("seomos.theme", next);
      } catch {
        // localStorage no disponible: el cambio aplica igual en esta sesión
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
