import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { canEditAgent } from "@/lib/permissions";
import { AgentClient } from "@/components/agent/agent-client";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canEditAgent(session.role)) redirect("/inbox");

  return <AgentClient />;
}
