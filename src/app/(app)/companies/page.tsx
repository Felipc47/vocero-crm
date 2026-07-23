import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { CompaniesClient } from "@/components/companies/companies-client";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!session.isSuperadmin) redirect("/inbox");
  return <CompaniesClient />;
}
