import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { isOrgAdmin } from "@/lib/permissions";
import { TeamClient } from "@/components/settings/team-client";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!isOrgAdmin(session.role)) redirect("/settings/profile");

  return <TeamClient />;
}
