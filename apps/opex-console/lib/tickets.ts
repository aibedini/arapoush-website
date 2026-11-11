/** Helpdesk types shared by the inbox components (mirrors apps/opex-api/src/tickets/routes.ts). */
export type Sla = { next: string | null; kind: "first" | "resolve"; breached: boolean; firstResponseAt: string | null };
export type ListItem = {
  id: string;
  number: number;
  subject: string;
  requester: { name: string | null; email: string | null; company: string | null };
  status: string;
  priority: string;
  channel: "form" | "email";
  form: string | null;
  team: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  tags: string[];
  unread: boolean;
  sla: Sla;
  last_activity_at: string;
  created_at: string;
};
export type L = Partial<Record<"fa" | "en" | "tr", string>>;
export type TicketEvent = { id: string; kind: string; actor: { kind: string; id: string | null; name: string | null }; body: { text?: string; full?: string; subject?: string } | null; meta: Record<string, unknown>; created_at: string };
export type TicketView = {
  ticket: { id: string; number: number; status: string; priority: string; channel: string; tags: string[]; locale: string | null; page: string | null; ip: string | null; team: { id: string; name: string } | null; assignee: { id: string; name: string } | null; sla: Sla; created_at: string; resolved_at: string | null; merged_into: number | null };
  data: { subject: string; requester: { name?: string; email?: string; phone?: string; company?: string }; values: Record<string, string | string[] | boolean | number>; context?: { spec?: string[] } };
  form: { slug: string; version: number; fields: { id: string; type: string; label: L; options?: { value: string; label: L }[] }[] } | null;
  events: TicketEvent[];
  reads: { principal_id: string; display_name: string; first_opened_at: string; last_read_at: string }[];
  attachments: { id: string; event_id: string | null; field: string | null; name: string; mime: string; bytes: number; scan: string; created_at: string }[];
  history: { number: number; status: string; created_at: string }[];
};
export type Person = { id: string; name: string; role: string; teams: { team: string; role: string; available: boolean }[] };
export type Team = { id: string; key: string; name: string; sla: Record<string, { first: number; resolve: number }>; auto_assign: boolean; members: { id: string; name: string; role: "agent" | "lead"; available: boolean }[]; open: number };
export type SavedReply = { id: string; title: string; team: string | null; body: L; created_by: string };

export const pickL = (l: L | undefined, locale = "fa") => l?.[locale as keyof L] || l?.fa || l?.en || l?.tr || "";
export const initials = (name: string | null | undefined) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
export const ticketsChanged = () => window.dispatchEvent(new Event("opex:tickets-changed"));
