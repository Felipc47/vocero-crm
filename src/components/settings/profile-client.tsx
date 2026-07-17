"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Profile = { name: string; email: string; image: string | null };

/** Recorta al centro (cuadrado tipo "cover") y reescala a `size`px → JPEG dataURL. */
function resizeToDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("La imagen no es válida"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no disponible"));
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { profile: Profile } | null) => {
        if (d) {
          setProfile(d.profile);
          setName(d.profile.name);
          setImage(d.profile.image);
        }
      })
      .catch(() => setError("No se pudo cargar el perfil"));
  }, []);

  async function patch(payload: { name?: string; image?: string | null }) {
    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(data?.error?.message ?? "No se pudo guardar");
    }
    return (await res.json()) as { profile: Profile };
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;
    setError(null);
    setBusyPhoto(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      await patch({ image: dataUrl });
      setImage(dataUrl);
      router.refresh(); // el avatar de la barra lateral lo pinta el layout server
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setBusyPhoto(false);
    }
  }

  async function removePhoto() {
    setError(null);
    setBusyPhoto(true);
    try {
      await patch({ image: null });
      setImage(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar la foto");
    } finally {
      setBusyPhoto(false);
    }
  }

  async function saveName() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await patch({ name: name.trim() });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-sm text-text-3">Cargando…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tu perfil</CardTitle>
          <CardDescription>
            Tu nombre y tu foto se muestran en la barra lateral y en el equipo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Foto */}
          <div className="flex items-center gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-2xl font-semibold text-brand-text">
              {image ? (
                <Image
                  src={image}
                  alt="Tu foto"
                  width={80}
                  height={80}
                  className="h-20 w-20 object-cover"
                  unoptimized
                />
              ) : (
                initials(name || profile.name)
              )}
            </span>
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onPickFile}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyPhoto}
                  onClick={() => fileRef.current?.click()}
                >
                  {busyPhoto ? "Procesando…" : image ? "Cambiar foto" : "Subir foto"}
                </Button>
                {image && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyPhoto}
                    onClick={() => void removePhoto()}
                  >
                    Quitar
                  </Button>
                )}
              </div>
              <p className="text-xs text-text-3">
                JPG, PNG o WEBP. Se recorta al centro y se guarda en 256×256.
              </p>
            </div>
          </div>

          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nombre</Label>
            <Input
              id="profile-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Correo (solo lectura) */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Correo</Label>
            <Input
              id="profile-email"
              value={profile.email}
              disabled
              className="max-w-xs"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-brand-text">Perfil guardado ✓</p>}
          <Button
            disabled={saving || !name.trim() || name.trim() === profile.name}
            onClick={() => void saveName()}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
