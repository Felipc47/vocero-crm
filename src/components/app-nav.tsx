"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  FlaskConical,
  Inbox,
  Kanban,
  LogOut,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import type { Branding } from "@/lib/branding";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import { useTheme } from "@/components/use-theme";

const NAV = [
  { href: "/inbox", label: "Bandeja", icon: Inbox, badge: true },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/contacts", label: "Contactos", icon: Users },
  { href: "/agent", label: "Agente", icon: Sparkles },
  { href: "/lab", label: "Laboratorio", icon: FlaskConical },
] as const;

const linkBase =
  "flex items-center gap-3 rounded-[11px] px-[13px] py-[11px] text-sm font-bold transition-all";
/* Mock SEOMOS: el item activo va en acento sólido con sombra, no en soft. */
const linkActive = "bg-brand text-white shadow-accent";
const linkIdle = "text-mute hover:bg-surface-2 hover:text-foreground";

export function AppNav({
  branding,
  userName,
  userImage,
  role,
}: {
  branding: Branding;
  userName: string;
  userImage?: string | null;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [unread, setUnread] = useState(0);

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number }[];
    };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void refetchUnread();
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
  });

  return (
    <aside className="flex w-[250px] shrink-0 flex-col border-r bg-sidebar px-3.5 pb-4 pt-5">
      {/* Marca */}
      <div className="flex items-center gap-3 px-2 pb-5">
        <Image
          src="/brand/isotipo.png"
          alt=""
          width={38}
          height={38}
          className="h-[38px] w-[38px] shrink-0 rounded-[10px]"
          aria-hidden
          priority
        />
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-display text-[16px] font-bold tracking-tight">
            {branding.name}
          </span>
          <span className="block text-[11.5px] font-semibold text-mute">
            CRM · WhatsApp
          </span>
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(linkBase, active ? linkActive : linkIdle)}
            >
              <item.icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
              <span className="flex-1">{item.label}</span>
              {"badge" in item && item.badge && unread > 0 && (
                <span
                  className={cn(
                    "flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-extrabold",
                    active
                      ? "bg-white/25 text-white"
                      : "bg-surface-2 text-mute"
                  )}
                >
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5">
        <button
          onClick={toggle}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-surface-2"
        >
          {theme === "dark" ? (
            <Sun className="h-[18px] w-[18px]" strokeWidth={1.9} />
          ) : (
            <Moon className="h-[18px] w-[18px]" strokeWidth={1.9} />
          )}
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>

        <Link
          href="/settings"
          className={cn(
            linkBase,
            pathname.startsWith("/settings") ? linkActive : linkIdle
          )}
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={1.9} />
          Ajustes
        </Link>

        <div className="mt-1 flex items-center gap-2.5 border-t border-border px-2 py-2.5">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 text-xs font-extrabold text-foreground">
            {userImage ? (
              <Image
                src={userImage}
                alt=""
                width={34}
                height={34}
                className="h-[34px] w-[34px] object-cover"
                unoptimized
              />
            ) : (
              initials(userName)
            )}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-bold">
              {userName}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-mute">
              <span className="h-[7px] w-[7px] rounded-full bg-success" />
              {role === "owner" ? "Propietario" : "Equipo"} · En línea
            </span>
          </span>
          <button
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
            className="rounded-lg p-1.5 text-mute transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut className="h-[17px] w-[17px]" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </aside>
  );
}
