"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ContactAvatar } from "@/components/avatar";
import { cn } from "@/lib/utils";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { useEvents } from "@/components/use-events";
import { SlideOver } from "@/components/ui/slide-over";
import { useToast } from "@/components/ui/toast";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { Composer } from "./composer";
import { ContactPanel } from "./contact-panel";

export function InboxClient() {
  const [conversations, setConversations] = useState<ConversationDto[] | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  // Slide-over de detalles del lead (mock SEOMOS): se abre con "Ver detalles".
  const [detailOpen, setDetailOpen] = useState(false);
  // Se incrementa con cada evento SSE que puede cambiar la etapa/lead o el
  // estado del agente: el panel de detalles lo observa y refetch en vivo.
  const [detailRev, setDetailRev] = useState(0);

  const toast = useToast();
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const lastFetchRef = useRef<string | null>(null);

  const refetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { conversations: ConversationDto[] };
    setConversations(data.conversations);
    lastFetchRef.current = new Date().toISOString();
  }, []);

  const refetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(
      `/api/conversations/${conversationId}/messages`
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { messages: MessageDto[] };
    if (selectedIdRef.current === conversationId) setMessages(data.messages);
  }, []);

  useEffect(() => {
    void refetchConversations();
  }, [refetchConversations]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMessages([]);
      void refetchMessages(id);
      void fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      });
    },
    [refetchMessages]
  );

  // Enlace directo desde Contactos/Pipeline: /inbox?contact=<id>. Si el
  // contacto aún no tiene conversación (importado por CSV o creado a mano),
  // se crea vacía: con la ventana cerrada, el composer ofrece plantillas.
  const searchParams = useSearchParams();
  const contactParam = searchParams.get("contact");
  const createTriedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!contactParam || selectedIdRef.current || !conversations) return;
    const match = conversations.find((c) => c.contact.id === contactParam);
    if (match) {
      select(match.id);
      return;
    }
    if (createTriedRef.current === contactParam) return;
    createTriedRef.current = contactParam;
    void (async () => {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: contactParam }),
      }).catch(() => null);
      if (res?.ok) await refetchConversations();
    })();
  }, [contactParam, conversations, select, refetchConversations]);

  useEvents({
    onMessageNew: ({ conversationId, message }) => {
      if (selectedIdRef.current === conversationId) {
        const m = message as MessageDto;
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m]
        );
        void fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markRead: true }),
        });
      }
      void refetchConversations();
      // Un entrante nuevo puede crear/mover el lead: refresca el panel.
      setDetailRev((v) => v + 1);
    },
    onMessageStatus: ({ conversationId, messageId, status }) => {
      if (selectedIdRef.current !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, status: status as MessageDto["status"] } : m
        )
      );
    },
    onConversationUpdated: () => {
      void refetchConversations();
      // El agente movió de etapa o cambió el handoff: refresca el panel en vivo.
      setDetailRev((v) => v + 1);
    },
    onReconnect: () => {
      // Catch-up tras reconexión (contrato sse.md): refetch completo.
      void refetchConversations();
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      setDetailRev((v) => v + 1);
    },
  });

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  const sendText = useCallback(
    async (text: string): Promise<string | null> => {
      if (!selectedIdRef.current) return "Sin conversación seleccionada";
      const res = await fetch(
        `/api/conversations/${selectedIdRef.current}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        }
      ).catch(() => null);
      if (!res) return "Sin conexión con el servidor";
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return data?.error?.message ?? "No se pudo enviar el mensaje";
      }
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      void refetchConversations();
      return null;
    },
    [refetchMessages, refetchConversations]
  );

  const patchConversation = useCallback(
    async (patch: { aiEnabled?: boolean; reactivate?: boolean }) => {
      if (!selectedIdRef.current) return;
      await fetch(`/api/conversations/${selectedIdRef.current}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      void refetchConversations();
    },
    [refetchConversations]
  );

  // Ancla/desancla o archiva/desarchiva cualquier chat desde la lista. El
  // tope de 3 anclados lo valida el servidor (422) y aquí solo se informa.
  const pinOrArchive = useCallback(
    async (id: string, patch: { pinned?: boolean; archived?: boolean }) => {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      if (!res) {
        toast("Sin conexión con el servidor");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast(data?.error?.message ?? "No se pudo actualizar el chat");
        return;
      }
      if (patch.pinned !== undefined)
        toast(patch.pinned ? "Chat anclado" : "Chat desanclado");
      else if (patch.archived !== undefined)
        toast(patch.archived ? "Chat archivado" : "Chat desarchivado");
      void refetchConversations();
    },
    [refetchConversations, toast]
  );

  // Reinicia la conversación seleccionada: borra su historial y limpia estado.
  const resetConversation = useCallback(async (): Promise<boolean> => {
    const id = selectedIdRef.current;
    if (!id) return false;
    const res = await fetch(`/api/conversations/${id}/reset`, {
      method: "POST",
    }).catch(() => null);
    if (!res?.ok) return false;
    if (selectedIdRef.current === id) setMessages([]);
    void refetchMessages(id);
    void refetchConversations();
    return true;
  }, [refetchMessages, refetchConversations]);

  // Borra un contacto de forma permanente y sale de su conversación.
  const deleteContact = useCallback(
    async (contactId: string): Promise<boolean> => {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "DELETE",
      }).catch(() => null);
      if (!res?.ok) return false;
      setSelectedId(null);
      setMessages([]);
      setDetailOpen(false);
      setConversations(
        (prev) => prev?.filter((c) => c.contact.id !== contactId) ?? prev
      );
      void refetchConversations();
      return true;
    },
    [refetchConversations]
  );

  return (
    <div className="flex h-full">
      {/* Master-detail en mobile: lista a pantalla completa sin selección;
          con selección se muestra solo el hilo (botón atrás en el header). */}
      <section
        className={cn(
          "w-full shrink-0 overflow-hidden md:w-[400px] md:border-r",
          selected && "hidden md:block"
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={select}
          onSeeded={() => void refetchConversations()}
          onPatch={(id, patch) => void pinOrArchive(id, patch)}
        />
      </section>

      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex"
        )}
      >
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b bg-surface px-3 py-[15px] md:px-[22px]">
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Volver a la bandeja"
                className="rounded-lg p-1.5 text-mute transition-colors hover:bg-surface-2 hover:text-foreground md:hidden"
              >
                <ChevronLeft className="h-[21px] w-[21px]" strokeWidth={2.2} />
              </button>
              <ContactAvatar
                name={selected.contact.name}
                seed={selected.contact.id}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-semibold leading-tight">
                  {selected.contact.name}
                </p>
                <p
                  className={
                    selected.windowOpen
                      ? "text-xs font-bold text-success"
                      : "text-xs text-text-3"
                  }
                >
                  {selected.windowOpen
                    ? "ventana abierta"
                    : `+${selected.contact.phone}`}
                </p>
              </div>
              <button
                onClick={() => setDetailOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border bg-surface px-[15px] py-[9px] text-[13px] font-bold transition-colors hover:bg-surface-2"
              >
                Ver detalles
                <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.2} />
              </button>
            </header>
            <MessageThread messages={messages} />
            <Composer
              conversation={selected}
              onSend={sendText}
              onSent={() => {
                if (selectedIdRef.current)
                  void refetchMessages(selectedIdRef.current);
                void refetchConversations();
              }}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-chat text-sm text-text-3">
            Elige una conversación para ver el hilo
          </div>
        )}
      </section>

      {detailOpen && selected && (
        <SlideOver
          onClose={() => setDetailOpen(false)}
          ariaLabel={`Detalles de ${selected.contact.name}`}
        >
          <ContactPanel
            conversation={selected}
            refreshKey={detailRev}
            onPatchConversation={patchConversation}
            onResetConversation={resetConversation}
            onDeleteContact={deleteContact}
            onClose={() => setDetailOpen(false)}
          />
        </SlideOver>
      )}
    </div>
  );
}
