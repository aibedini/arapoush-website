/** Change request labels shared by the queue and the review page. */
export type CrSummary = { id: string; title: string; state: string; created_at: string; updated_at: string; four_eyes: boolean; approvals: number; effect: string | null; author: string | null; partner: string | null; items: number; entries: string[] | null };

export const STATE: Record<string, { label: string; tone: string }> = {
  submitted: { label: "ثبت شده", tone: "" },
  pending_review: { label: "در انتظار بررسی", tone: "warn" },
  approved: { label: "تأییدشده (منتشرنشده)", tone: "accent" },
  published: { label: "منتشر شد", tone: "ok" },
  rejected: { label: "رد شد", tone: "bad" },
  withdrawn: { label: "پس گرفته شد", tone: "" },
  needs_rebase: { label: "نیازمند به‌روزرسانی", tone: "warn" },
  expired: { label: "منقضی", tone: "" },
};
