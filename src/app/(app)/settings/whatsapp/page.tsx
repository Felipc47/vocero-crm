import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isOrgAdmin } from "@/lib/permissions";
import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";

export const dynamic = "force-dynamic";

export default async function WhatsappSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!isOrgAdmin(session.role)) redirect("/settings/profile");

  return <WhatsappWizard />;
}
