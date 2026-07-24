"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/profile", label: "Perfil", adminOnly: false },
  { href: "/settings/whatsapp", label: "WhatsApp", adminOnly: true },
  { href: "/settings/calendar", label: "Calendario", adminOnly: true },
  { href: "/settings/branding", label: "Marca", adminOnly: true },
  { href: "/settings/team", label: "Equipo", adminOnly: true },
] as const;

/** Los roles no-admin solo ven los ajustes de su propia cuenta (Perfil). */
export function SettingsNav({ isAdmin = true }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  return (
    /* Mobile: tabs horizontales con scroll; desktop: columna lateral de 210px. */
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 md:w-[210px] md:flex-col md:overflow-visible md:border-b-0 md:border-r md:px-4 md:py-[22px]">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "block whitespace-nowrap rounded-[10px] px-[15px] py-[9px] text-sm transition-colors md:py-[11px]",
              active
                ? "bg-brand font-bold text-white"
                : "font-semibold text-mute hover:bg-surface-2 hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
