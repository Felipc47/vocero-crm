import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { canApproveTemplates, canWriteTemplates } from "@/lib/permissions";
import { TemplatesClient } from "@/components/settings/templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canWriteTemplates(session.role)) redirect("/inbox");
  const canApprove = session.isSuperadmin || canApproveTemplates(session.role);
  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-surface px-4 py-3 md:px-[30px] md:py-[18px]">
        <h2 className="font-display text-[22px] font-bold">Plantillas</h2>
      </header>
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-[34px] md:py-[26px]">
        <div className="mx-auto max-w-[900px]">
          <TemplatesClient canApprove={canApprove} />
        </div>
      </div>
    </div>
  );
}
