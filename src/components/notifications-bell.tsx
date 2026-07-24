"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEvents } from "@/components/use-events";

type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

/**
 * Campana de notificaciones in-app (ej. plantillas por aprobar): contador de
 * no leídas en vivo por SSE; abrir el panel las marca leídas.
 */
export function NotificationsBell({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "header";
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/notifications").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      notifications: NotificationDto[];
      unread: number;
    };
    setItems(data.notifications);
    setUnread(data.unread);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEvents({
    onNotificationNew: () => void refetch(),
    onReconnect: () => void refetch(),
  });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await fetch("/api/notifications", { method: "PATCH" }).catch(() => null);
      setUnread(0);
    }
  }

  return (
    <>
      <button
        onClick={() => void toggle()}
        aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ""}`}
        className={cn(
          "relative",
          variant === "sidebar"
            ? "flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[13px] font-bold text-foreground transition-colors hover:bg-surface-2"
            : "rounded-lg border border-border bg-surface p-2 text-foreground transition-colors hover:bg-surface-2"
        )}
      >
        <Bell
          className={variant === "sidebar" ? "h-[18px] w-[18px]" : "h-[17px] w-[17px]"}
          strokeWidth={1.9}
        />
        {variant === "sidebar" && "Notificaciones"}
        {unread > 0 && (
          <span
            className={cn(
              "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white",
              variant === "sidebar" ? "ml-auto" : "absolute -right-1.5 -top-1.5"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "fixed z-50 max-h-[70vh] w-[340px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border bg-surface p-2 shadow-xl",
              variant === "sidebar"
                ? "bottom-6 left-4 md:left-[260px]"
                : "right-3 top-14"
            )}
          >
            <p className="px-3 py-2 text-[12px] font-extrabold uppercase tracking-wide text-text-3">
              Notificaciones
            </p>
            {items.length === 0 ? (
              <p className="px-3 pb-4 pt-1 text-center text-[12.5px] text-text-3">
                Nada por ahora.
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        setOpen(false);
                        if (n.href) router.push(n.href);
                      }}
                      className={cn(
                        "w-full rounded-[11px] px-3 py-2.5 text-left transition-colors hover:bg-subtle",
                        !n.readAt && "bg-brand-tint"
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-bold">{n.title}</span>
                        <span className="shrink-0 text-[10.5px] text-faint">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-[12px] leading-snug text-text-2">
                          {n.body}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
