"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, MessageCircle, Search, Trash2 } from "lucide-react";
import type { ContactDto } from "@/lib/types";
import { formatPhone } from "@/lib/utils";
import { stageColor } from "@/lib/stage-colors";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StageTag } from "@/components/ui/stage-tag";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

export function ContactsClient() {
  const toast = useToast();
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ContactDto | null>(null);
  const [deleting, setDeleting] = useState<ContactDto | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (showArchived) params.set("archived", "true");
    const res = await fetch(`/api/contacts?${params}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { contacts: ContactDto[] };
    setContacts(data.contacts);
  }, [query, showArchived]);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 250);
    return () => clearTimeout(t);
  }, [refetch]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    void refetch();
  }

  async function removeContact(c: ContactDto) {
    setBusy(true);
    const res = await fetch(`/api/contacts/${c.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    setDeleting(null);
    if (res?.ok) {
      toast("Contacto eliminado");
      void refetch();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5 border-b bg-surface px-4 py-3 md:px-[30px] md:py-[18px]">
        <h2 className="font-display text-[22px] font-bold">Contactos</h2>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-[13px] font-bold">Ver archivados</span>
          <Switch
            size="sm"
            checked={showArchived}
            onCheckedChange={setShowArchived}
            aria-label="Ver archivados"
          />
        </div>
        <div className="order-last flex w-full items-center gap-2 rounded-[10px] border bg-surface-2 px-3 py-[9px] transition-colors focus-within:border-brand focus-within:bg-background focus-within:ring-[3px] focus-within:ring-brand-soft md:order-none md:w-[320px]">
          <Search className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} />
          <input
            placeholder="Buscar por nombre o teléfono…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-faint md:text-[13px]"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-[30px]">
        {contacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">Sin contactos</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Cada persona que escriba a tu WhatsApp quedará registrada aquí
              automáticamente.
            </p>
          </div>
        ) : (
          <ul className="mx-auto flex max-w-[1000px] flex-col gap-3">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-[14px] border bg-surface px-4 py-3.5 transition-colors hover:border-brand/50 md:gap-4 md:px-5 md:py-4"
              >
                <ContactAvatar name={c.name} seed={c.id} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-base font-semibold">
                      {c.name}
                    </span>
                    {c.archivedAt && <Badge variant="secondary">Archivado</Badge>}
                  </div>
                  <p className="truncate text-[13px] text-mute">
                    <span className="font-bold text-foreground">
                      {formatPhone(c.phone)}
                    </span>
                    {c.notes ? ` · ${c.notes.slice(0, 80)}` : ""}
                  </p>
                </div>
                {c.stage && (
                  <StageTag
                    name={c.stage.name}
                    color={stageColor(c.stage)}
                    className="shrink-0"
                  />
                )}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setEditing(c)}
                    className="rounded-[9px] bg-brand px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-hover"
                  >
                    Editar
                  </button>
                  <Link
                    href={`/inbox?contact=${c.id}`}
                    aria-label="Abrir conversación"
                    title="Abrir chat"
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border bg-surface-2 text-mute transition-colors hover:text-foreground"
                  >
                    <MessageCircle className="h-[17px] w-[17px]" strokeWidth={2} />
                  </Link>
                  <button
                    aria-label={c.archivedAt ? "Desarchivar" : "Archivar"}
                    title={c.archivedAt ? "Desarchivar" : "Archivar"}
                    onClick={() => {
                      void patch(c.id, { archived: !c.archivedAt });
                      toast(
                        c.archivedAt ? "Contacto desarchivado" : "Contacto archivado"
                      );
                    }}
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border bg-surface-2 text-mute transition-colors hover:text-foreground"
                  >
                    {c.archivedAt ? (
                      <ArchiveRestore className="h-[17px] w-[17px]" strokeWidth={2} />
                    ) : (
                      <Archive className="h-[17px] w-[17px]" strokeWidth={2} />
                    )}
                  </button>
                  <button
                    aria-label="Eliminar contacto"
                    title="Eliminar"
                    onClick={() => setDeleting(c)}
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-brand/40 bg-brand-tint text-brand transition-colors hover:bg-brand-soft"
                  >
                    <Trash2 className="h-[17px] w-[17px]" strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditDialog
          contact={editing}
          onClose={() => setEditing(null)}
          onSave={async (patchBody) => {
            await patch(editing.id, patchBody);
            setEditing(null);
            toast("Cambios guardados");
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Eliminar contacto"
          message={
            <>
              Se eliminará{" "}
              <strong className="text-foreground">{deleting.name}</strong> y
              toda su información del pipeline. Esta acción no se puede
              deshacer.
            </>
          }
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void removeContact(deleting)}
        />
      )}
    </div>
  );
}

function EditDialog({
  contact,
  onClose,
  onSave,
}: {
  contact: ContactDto;
  onClose: () => void;
  onSave: (patch: { name: string; notes: string }) => Promise<void>;
}) {
  const [name, setName] = useState(contact.name);
  const [notes, setNotes] = useState(contact.notes ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex animate-[fade-in_.16s_ease] items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-[pop-in_.2s_ease] rounded-2xl bg-surface p-6 shadow-[0_24px_60px_rgba(0,0,0,.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-display text-[19px] font-bold">
          Editar contacto
        </h3>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-[12.5px] font-bold" htmlFor="edit-name">
              Nombre
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12.5px] font-bold" htmlFor="edit-notes">
              Notas
            </label>
            <Textarea
              id="edit-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => void onSave({ name: name.trim(), notes })}
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
