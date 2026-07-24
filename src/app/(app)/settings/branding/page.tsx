import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isOrgAdmin } from "@/lib/permissions";
import { BrandingClient } from "@/components/settings/branding-client";

export const dynamic = "force-dynamic";

export default async function BrandingSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!isOrgAdmin(session.role)) redirect("/settings/profile");

  return <BrandingClient />;
}
