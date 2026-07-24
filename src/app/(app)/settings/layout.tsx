import { getSessionOrNull } from "@/lib/auth/session";
import { isOrgAdmin } from "@/lib/permissions";
import { SettingsNav } from "@/components/settings/settings-nav";

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  const isAdmin = session ? isOrgAdmin(session.role) : false;
  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-surface px-4 py-3 md:px-[30px] md:py-[18px]">
        <h2 className="font-display text-[22px] font-bold">Configuración</h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SettingsNav isAdmin={isAdmin} />
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-[34px] md:py-[26px]">
          <div className="mx-auto max-w-[900px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
