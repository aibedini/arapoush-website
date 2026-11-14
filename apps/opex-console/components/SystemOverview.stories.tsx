import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import SystemOverview, { type Overview } from "./SystemOverview";

/**
 * Settings → Overview: health score, services, memory/disk bars, storage per area, activity and the
 * best-practice checks (failures first, with a fix link or a button to the right settings tab).
 */
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const sample: Overview = {
  generatedAt: "2026-11-14T08:00:00.000Z",
  score: 72,
  services: [
    { id: "database", ok: true, latencyMs: 2, detail: "pg" },
    { id: "website", ok: true, latencyMs: 84, detail: null },
    { id: "scanner", ok: true, latencyMs: 3, detail: null },
    { id: "mail", ok: false, latencyMs: null, detail: "SMTP_URL not set" },
    { id: "renderer", ok: true, latencyMs: null, detail: null },
  ],
  host: { memTotalBytes: 3.73 * GB, memAvailableBytes: 1.9 * GB, swapTotalBytes: 2 * GB, swapFreeBytes: 1.8 * GB, cpus: 2, load: [0.21, 0.3, 0.28], uptimeSeconds: 147 * 86400, apiRssBytes: 86 * MB, apiUptimeSeconds: 5400, node: "v22.23.5" },
  disks: [
    { id: "data", path: "/data", totalBytes: 38 * GB, freeBytes: 21 * GB },
    { id: "backups", path: "/backups", totalBytes: 38 * GB, freeBytes: 21 * GB },
  ],
  storage: { databaseBytes: 42 * MB, mediaBytes: 310 * MB, mediaFiles: 214, backupsBytes: 120 * MB, backupFiles: 3, auditEvents: 1840 },
  activity: { entries: 46, published: 44, drafts: 3, assets: 214, assetBytes: 305 * MB, ticketsOpen: 4, ticketsWeek: 9, operators: 3, lockedOperators: 0, lastBackupAt: "2026-11-14T03:00:00.000Z", lastBackupBytes: 40 * MB, lastSeoAt: "2026-11-14T02:00:00.000Z", lastSeoScore: 91, lastRenderAt: null },
  ssl: { https: true, validTo: "2027-02-12T00:00:00.000Z", issuer: "Let's Encrypt", daysLeft: 90, error: null },
  checks: [
    { id: "ssl.valid", area: "security", level: "ok", value: "90" },
    { id: "console.allowlist", area: "security", level: "warn", value: "0.0.0.0/0 ::/0" },
    { id: "operators.mfa", area: "security", level: "fail", value: "1" },
    { id: "backups.recent", area: "reliability", level: "ok", value: "5" },
    { id: "backups.offsite", area: "reliability", level: "warn", value: "none" },
    { id: "mail.smtp", area: "operations", level: "warn", value: null },
    { id: "memory.available", area: "performance", level: "ok", value: "51" },
    { id: "disk.free", area: "performance", level: "ok", value: "55" },
    { id: "seo.verification", area: "seo", level: "warn", value: null },
    { id: "seo.score", area: "seo", level: "ok", value: "91" },
  ],
};

const meta = {
  title: "Console/System overview",
  component: SystemOverview,
  parameters: { layout: "padded" },
  args: { data: sample, onRefresh: fn(), onSettingsTab: fn() },
} satisfies Meta<typeof SystemOverview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByText("۷۲")).toBeInTheDocument();
    await expect(c.getByText("۱ مورد نیاز به رسیدگی دارد")).toBeInTheDocument();
    // Failures sort first in their group, with what to do.
    await expect(c.getByText("۱ اپراتور هنوز اپلیکیشن احراز هویت را فعال نکرده‌اند.")).toBeInTheDocument();
    // A check fixed on another settings tab switches the tab.
    await userEvent.click(c.getByRole("button", { name: /رفع: تأیید مالکیت/ }));
    await expect(args.onSettingsTab).toHaveBeenCalledWith("analytics");
    await userEvent.click(c.getByRole("button", { name: "بررسی دوباره" }));
    await expect(args.onRefresh).toHaveBeenCalled();
  },
};

export const AllHealthy: Story = {
  args: { data: { ...sample, score: 100, services: sample.services.map((s) => ({ ...s, ok: true })), checks: sample.checks.map((c) => ({ ...c, level: "ok" as const })) } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("همه‌چیز سالم است")).toBeInTheDocument();
  },
};

export const Checking: Story = { args: { busy: true } };
