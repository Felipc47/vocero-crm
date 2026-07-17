import type { Metadata } from "next";
import { Poppins, Nunito } from "next/font/google";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import "./globals.css";

// next/font descarga las fuentes en BUILD y las sirve self-hosted (sin CDN).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return {
    title: `${branding.name} — CRM de WhatsApp`,
    description: "CRM de WhatsApp con agente de IA y Laboratorio de auto-evaluación",
  };
}

// Anti-flash de tema: aplica la clase `dark` antes del primer paint según la
// preferencia guardada (o el esquema del sistema si no hay ninguna).
const themeScript = `(function(){try{var t=localStorage.getItem('seomos.theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  // Solo inyectamos el acento cuando es personalizado; con el default dejamos
  // que globals.css maneje el matiz de acento en claro y oscuro.
  const customAccent = branding.accent !== DEFAULT_BRANDING.accent;
  return (
    <html lang="es" className={`${poppins.variable} ${nunito.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {customAccent && (
          <style
            dangerouslySetInnerHTML={{
              __html: accentCssVariables(branding.accent),
            }}
          />
        )}
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
