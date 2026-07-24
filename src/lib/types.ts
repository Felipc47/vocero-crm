/** DTOs que viajan por la API interna (lado cliente). */

export type ConversationDto = {
  id: string;
  contact: { id: string; name: string; phone: string };
  stageName: string | null;
  aiEnabled: boolean;
  handoffAt: string | null;
  handoffReason: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowOpen: boolean;
  windowRemainingMs: number;
  preview: string | null;
  pinnedAt: string | null;
  archivedAt: string | null;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  aiGenerated: boolean;
  createdAt: string;
  hasMedia: boolean;
  mediaMime: string | null;
  mediaFilename: string | null;
};

export type TemplateDto = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: "draft" | "awaiting_approval" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
};

export type StageDto = {
  id: string;
  name: string;
  position: number;
  /** `scheduled` la mueve el sistema al confirmarse una reunión. */
  kind: "open" | "scheduled" | "won" | "lost";
};

export type ContactDto = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  /** Ficha extraída por IA de la conversación (se regenera, no se acumula). */
  aiProfile?: LeadProfileDto | null;
  aiProfileAt?: string | null;
  archivedAt: string | null;
  /** Cumplimiento de la política de Meta (006). */
  optedOutAt?: string | null;
  optedOutReason?: string | null;
  consentSource?: "meta_lead_ads" | "inbound_message" | "manual" | "imported" | null;
  consentGrantedAt?: string | null;
  /** Etapa del lead del contacto (solo lectura; listado de Contactos). */
  stage?: {
    name: string;
    kind: "open" | "scheduled" | "won" | "lost";
    position: number;
  } | null;
};

export type LeadProfileDto = {
  contactName?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  needs: string[];
  budget?: string | null;
  timeline?: string | null;
  summary?: string | null;
};

/** Envío masivo (005). */
export type CampaignProgressDto = {
  total: number;
  pending: number;
  sent: number;
  failed: number;
};

export type CampaignStatus =
  | "draft"
  | "running"
  | "paused"
  | "done"
  | "failed";

export type CampaignDto = {
  id: string;
  name: string;
  status: CampaignStatus;
  templateName: string;
  variableMode: "none" | "contact_name" | "fixed";
  error: string | null;
  createdAt: string;
  progress: CampaignProgressDto;
};

export type CampaignRecipientDto = {
  id: string;
  status: "pending" | "sent" | "failed";
  error: string | null;
  contactName: string;
  contactPhone: string;
};

export type AudienceFilterDto =
  | { mode: "all" }
  | { mode: "stages"; stageIds: string[] }
  | { mode: "services"; serviceIds: string[] }
  | { mode: "manual"; contactIds: string[] };
