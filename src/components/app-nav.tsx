"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  FileText,
  Inbox,
  Kanban,
  LogOut,
  Megaphone,
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
  { href: "/templates", label: "Plantillas", icon: FileText },
  { href: "/campaigns", label: "Envío masivo", icon: Megaphone },
  { href: "/services", label: "Servicios", icon: Briefcase },
] as const;

/* En mobile la sidebar no cabe: la navegación baja a una tab bar con las
   mismas secciones más Ajustes. */
const MOBILE_NAV = [
  ...NAV,
  { href: "/settings", label: "Ajustes", icon: Settings },
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

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function logout() {
    await signOut();
    router.push("/login");
  }

  return (
    <>
      {/* Mobile: header superior compacto (marca + tema + salir) */}
      <header className="flex shrink-0 items-center gap-2.5 border-b bg-sidebar px-4 py-2.5 md:hidden">
        <Image
          src="/brand/isotipo.png"
          alt=""
          width={30}
          height={30}
          className="h-[30px] w-[30px] shrink-0 rounded-[8px]"
          aria-hidden
          priority
        />
        <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-tight">
          {branding.name}
        </span>
        <button
          onClick={toggle}
          aria-label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          className="rounded-lg border border-border bg-surface p-2 text-foreground transition-colors hover:bg-surface-2"
        >
          {theme === "dark" ? (
            <Sun className="h-[17px] w-[17px]" strokeWidth={1.9} />
          ) : (
            <Moon className="h-[17px] w-[17px]" strokeWidth={1.9} />
          )}
        </button>
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 text-[11px] font-extrabold text-foreground">
          {userImage ? (
            <Image
              src={userImage}
              alt=""
              width={30}
              height={30}
              className="h-[30px] w-[30px] object-cover"
              unoptimized
            />
          ) : (
            initials(userName)
          )}
        </span>
        <button
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          onClick={() => void logout()}
          className="rounded-lg p-1.5 text-mute transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="h-[17px] w-[17px]" strokeWidth={1.9} />
        </button>
      </header>

      {/* Mobile: tab bar inferior. Va en el flujo (order-1 la manda al final
          del layout en columna) para no tapar contenido. */}
      <nav className="order-1 flex shrink-0 items-stretch border-t bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 pt-2.5 text-[10px] font-bold transition-colors",
                active ? "text-brand" : "text-mute hover:text-foreground"
              )}
            >
              <span className="relative">
                <item.icon className="h-[21px] w-[21px]" strokeWidth={1.9} />
                {"badge" in item && item.badge && unread > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[9.5px] font-extrabold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Desktop: sidebar original de 250px */}
      <aside className="hidden w-[250px] shrink-0 flex-col border-r bg-sidebar px-3.5 pb-4 pt-5 md:flex">
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
            const active = isActive(item.href);
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
              onClick={() => void logout()}
              className="rounded-lg p-1.5 text-mute transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
