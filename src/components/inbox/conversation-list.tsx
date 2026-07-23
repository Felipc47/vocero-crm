"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Pin,
  PinOff,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { ConversationDto } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { StageTag } from "@/components/ui/stage-tag";
import { useStageColors } from "@/components/use-stage-colors";
import { formatTime, previewText } from "./helpers";

function EmptyState({ onSeeded }: { onSeeded: () => void }) {
  const [seeding, setSeeding] = useState(false);
  const [failed, setFailed] = useState(false);

  async function seed() {
    setSeeding(true);
    const res = await fetch("/api/seed/demo", { method: "POST" }).catch(
      () => null
    );
    setSeeding(false);
    if (res?.ok) onSeeded();
    else setFailed(true);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">Sin conversaciones todavía</p>
      <p className="text-xs text-text-3">
        Cuando alguien escriba a tu número de WhatsApp, su conversación
        aparecerá aquí en tiempo real.
      </p>
      {!failed && (
        <Button
          size="sm"
          variant="outline"
          disabled={seeding}
          onClick={() => void seed()}
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.7} />
          {seeding ? "Cargando demo…" : "Cargar datos de demostración"}
        </Button>
      )}
    </div>
  );
}

/** Menú contextual de la fila: anclar/desanclar y archivar/desarchivar. */
function RowActions({
  conversation: c,
  onPatch,
}: {
  conversation: ConversationDto;
  onPatch: (id: string, patch: { pinned?: boolean; archived?: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);

  const items = [
    c.archivedAt
      ? null
      : {
          label: c.pinnedAt ? "Desanclar" : "Anclar",
          icon: c.pinnedAt ? PinOff : Pin,
          patch: { pinned: !c.pinnedAt },
        },
    {
      label: c.archivedAt ? "Desarchivar" : "Archivar",
      icon: c.archivedAt ? ArchiveRestore : Archive,
      patch: { archived: !c.archivedAt },
    },
  ].filter((i) => i !== null);

  return (
    <div className="absolute right-2 top-2.5">
      <button
        aria-label={`Opciones del chat con ${c.contact.name}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md text-mute transition-opacity hover:bg-subtle hover:text-foreground",
          open
            ? "opacity-100"
            : "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        )}
      >
        <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-[11px] border bg-surface py-1 shadow-lg">
            {items.map((item) => (
              <button
                key={item.label}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onPatch(c.id, item.patch);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-subtle"
              >
                <item.icon className="h-4 w-4 text-mute" strokeWidth={2} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ConversationList({
  conversations: conversationsProp,
  selectedId,
  onSelect,
  onSeeded,
  onPatch,
}: {
  conversations: ConversationDto[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
  onPatch: (id: string, patch: { pinned?: boolean; archived?: boolean }) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("all");
  const colorFor = useStageColors();

  const loading = conversationsProp === null;
  const conversations = conversationsProp ?? [];
  const q = query.trim().toLowerCase();
  const matches = (c: ConversationDto) =>
    !q ||
    c.contact.name.toLowerCase().includes(q) ||
    c.contact.phone.includes(q) ||
    (c.preview ?? "").toLowerCase().includes(q);

  const inboxed = conversations.filter((c) => !c.archivedAt && matches(c));
  const archived = conversations.filter((c) => c.archivedAt && matches(c));
  const unreadCount = inboxed.filter((c) => c.unreadCount > 0).length;
  const filtered =
    filter === "archived"
      ? archived
      : filter === "unread"
        ? inboxed.filter((c) => c.unreadCount > 0)
        : inboxed;
  // Ancladas primero (la más antigua arriba, orden estable estilo WhatsApp);
  // el resto conserva el orden del servidor (último mensaje primero).
  const visible =
    filter === "archived"
      ? filtered
      : [...filtered].sort((a, b) => {
          if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
          if (a.pinnedAt && b.pinnedAt)
            return a.pinnedAt < b.pinnedAt ? -1 : 1;
          return 0;
        });

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="px-5 pb-3 pt-5">
        <div className="mb-3.5 flex items-baseline gap-2">
          <h2 className="font-display text-[21px] font-bold">Bandeja</h2>
          <span className="text-[13px] font-extrabold text-mute">
            {conversations.filter((c) => !c.archivedAt).length}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-[11px] border bg-surface-2 px-3 py-[10px] transition-colors focus-within:border-brand focus-within:bg-background focus-within:ring-[3px] focus-within:ring-brand-soft">
          <Search className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} />
          <input
            placeholder="Buscar conversación…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-faint md:text-[13.5px]"
          />
        </div>
        <div className="mt-3.5 flex gap-2">
          {(
            [
              { id: "all", label: "Todas", count: inboxed.length },
              { id: "unread", label: "No leídas", count: unreadCount },
              { id: "archived", label: "Archivadas", count: archived.length },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-[15px] py-2 text-[13px] font-extrabold transition-colors",
                filter === f.id
                  ? "bg-foreground text-background"
                  : "bg-surface-2 text-mute hover:bg-subtle"
              )}
            >
              {f.label}
              <span className="opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        {loading ? (
          <p className="p-6 text-center text-xs text-text-3">Cargando…</p>
        ) : conversations.length === 0 ? (
          <EmptyState onSeeded={onSeeded} />
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">
            {filter === "archived"
              ? "No tienes chats archivados."
              : "Sin resultados para este filtro."}
          </p>
        ) : (
          <ul>
            {visible.map((c) => {
              const unread = c.unreadCount > 0;
              const active = selectedId === c.id;
              return (
                <li key={c.id} className="group relative mb-0.5">
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[13px] px-3 py-[13px] text-left transition-colors",
                      active
                        ? "bg-brand-tint shadow-[inset_3px_0_0_var(--accent)]"
                        : "hover:bg-subtle"
                    )}
                  >
                    <span className="relative shrink-0">
                      <ContactAvatar
                        name={c.contact.name}
                        seed={c.contact.id}
                        size="lg"
                      />
                      <span
                        title={
                          c.windowOpen
                            ? "Ventana abierta (24 h)"
                            : "Ventana cerrada — usa una plantilla"
                        }
                        className={cn(
                          "absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-2 border-surface",
                          c.windowOpen ? "bg-success" : "bg-[#B4ADA0]"
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 pr-6">
                        <span
                          className={cn(
                            "truncate text-[14.5px] font-bold",
                            !unread && "font-semibold"
                          )}
                        >
                          {c.contact.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {c.pinnedAt && (
                            <Pin
                              aria-label="Chat anclado"
                              className="h-3 w-3 text-mute"
                              strokeWidth={2.2}
                            />
                          )}
                          <span
                            className={cn(
                              "text-[11px] font-semibold",
                              unread ? "text-brand" : "text-faint"
                            )}
                          >
                            {formatTime(c.lastMessageAt)}
                          </span>
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            unread ? "font-medium text-text-2" : "text-mute"
                          )}
                        >
                          {previewText(c.preview)}
                        </span>
                        {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-semibold text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-[7px] flex flex-wrap items-center gap-1.5">
                        {c.stageName && (
                          <StageTag
                            name={c.stageName}
                            color={colorFor(c.stageName)}
                          />
                        )}
                        {c.handoffAt && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[11px] font-bold text-mute">
                            <UserRound className="h-3 w-3" strokeWidth={2.2} />
                            Atención humana
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <RowActions conversation={c} onPatch={onPatch} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
