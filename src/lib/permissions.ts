/**
 * Roles por empresa y su matriz de permisos (server + UI usan lo mismo).
 *
 * - `owner` (Admin): todo dentro de su empresa, incluidas conexiones
 *   (WhatsApp, Calendar), marca, equipo y aprobación de plantillas.
 * - `agent_editor` (Editor de agente): configura el agente y ve la bandeja.
 * - `commercial` (Ejecutivo comercial y marketing): bandeja, etapas del
 *   prospecto, contactos, plantillas (con aprobación del admin), envío
 *   masivo y servicios (sin vincular formularios). Solo los ajustes de su
 *   propia cuenta.
 */

export type Role = "owner" | "agent_editor" | "commercial";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Admin",
  agent_editor: "Editor de agente",
  commercial: "Ejecutivo comercial y marketing",
};

export const ASSIGNABLE_ROLES: Role[] = ["owner", "agent_editor", "commercial"];

/** Tope de equipo para toda empresa que no sea la del superadmin. */
export const TEAM_LIMIT = 6;

/** Roles históricos: `member` (cuentas de equipo viejas) equivale a comercial. */
export function normalizeRole(raw: string): Role {
  if (raw === "owner" || raw === "admin") return "owner";
  if (raw === "agent_editor") return "agent_editor";
  return "commercial";
}

export function isOrgAdmin(role: string): boolean {
  return normalizeRole(role) === "owner";
}

/** Conexiones y configuración de la empresa: WhatsApp, Calendar, webhook,
 * marca, equipo, saludo de leads y vinculación de formularios. */
export function canManageOrgSettings(role: string): boolean {
  return isOrgAdmin(role);
}

export function canEditAgent(role: string): boolean {
  const r = normalizeRole(role);
  return r === "owner" || r === "agent_editor";
}

/** Plantillas: el comercial puede crear/editar, pero pasan por aprobación
 * del admin antes de enviarse a Meta. Borrar (toca Meta) es del admin. */
export function canWriteTemplates(role: string): boolean {
  const r = normalizeRole(role);
  return r === "owner" || r === "commercial";
}

export function templatesRequireApproval(role: string): boolean {
  return normalizeRole(role) === "commercial";
}

export function canApproveTemplates(role: string): boolean {
  return isOrgAdmin(role);
}
