"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/profile", label: "Perfil" },
  { href: "/settings/whatsapp", label: "WhatsApp" },
  { href: "/settings/branding", label: "Marca" },
  { href: "/settings/templates", label: "Plantillas" },
  { href: "/settings/team", label: "Equipo" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="w-[210px] shrink-0 border-r px-4 py-[22px]">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "mb-0.5 block rounded-[10px] px-[15px] py-[11px] text-sm transition-colors",
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
