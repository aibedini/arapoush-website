import type { Q } from "../db/index.ts";

/**
 * Console permissions (S1). Every console route (`/v1/manage/**`) needs exactly one permission from
 * this catalogue; `ROUTE_PERMISSIONS` maps each route to it and the console guard enforces it. A route
 * missing from the map is denied to everybody (and a test fails).
 *
 * Effective permissions of an operator = its role's permissions + its own `perm_allow` − its own
 * `perm_deny`. `super_admin` always has every permission. `self` routes (your own session, password,
 * preferences) only need a signed-in operator.
 */
export type PermissionDef = { key: string; group: string; label: { en: string; fa: string }; danger?: boolean };

const P = (key: string, group: string, en: string, fa: string, danger = false): PermissionDef => ({ key, group, label: { en, fa }, danger });

export const PERMISSIONS: PermissionDef[] = [
  P("dashboard.read", "dashboard", "See the dashboard", "دیدن داشبورد"),
  P("content.read", "content", "Read content, revisions and diffs", "خواندن محتوا، نسخه‌ها و تفاوت‌ها"),
  P("content.write", "content", "Edit content drafts", "ویرایش پیش‌نویس محتوا"),
  P("content.publish", "content", "Publish, schedule and roll back content", "انتشار، زمان‌بندی و بازگردانی محتوا", true),
  P("preview.use", "content", "Open draft previews and the visual editor", "پیش‌نمایش و ویرایشگر بصری"),
  P("media.read", "media", "Browse the media library", "مرور کتابخانه رسانه"),
  P("media.upload", "media", "Upload media", "بارگذاری رسانه"),
  P("catalogue.read", "catalogue", "Read the product catalogue and 3D models", "خواندن کاتالوگ و مدل‌های سه‌بعدی"),
  P("catalogue.write", "catalogue", "Upload 3D models and edit mounting", "بارگذاری مدل و ویرایش نصب"),
  P("catalogue.approve", "catalogue", "Approve 3D models", "تأیید مدل‌های سه‌بعدی", true),
  P("catalogue.import", "catalogue", "Import the tube catalogue (xlsx)", "درون‌ریزی کاتالوگ تیوب (xlsx)", true),
  P("render.read", "catalogue", "See render jobs", "دیدن کارهای رندر"),
  P("render.run", "catalogue", "Start renders", "اجرای رندر", true),
  P("forms.read", "forms", "Read forms and their versions", "خواندن فرم‌ها و نسخه‌ها"),
  P("forms.write", "forms", "Create, edit and duplicate forms", "ساخت، ویرایش و کپی فرم"),
  P("forms.publish", "forms", "Publish forms and change their status", "انتشار و تغییر وضعیت فرم", true),
  P("tickets.read", "helpdesk", "Read tickets, attachments and the helpdesk", "خواندن تیکت‌ها و پیوست‌ها"),
  P("tickets.reply", "helpdesk", "Reply, add notes, use saved replies", "پاسخ، یادداشت و پاسخ‌های آماده"),
  P("tickets.manage", "helpdesk", "Assign, refer, merge, mark spam, bulk edit", "ارجاع، ادغام، اسپم و ویرایش گروهی"),
  P("tickets.delete", "helpdesk", "Delete tickets", "حذف تیکت", true),
  P("tickets.mailbox", "helpdesk", "See the helpdesk mailbox settings", "دیدن تنظیمات صندوق ایمیل"),
  P("teams.read", "helpdesk", "See teams", "دیدن تیم‌ها"),
  P("teams.manage", "helpdesk", "Create, edit and delete teams", "مدیریت تیم‌ها", true),
  P("cr.read", "requests", "Read change requests", "خواندن درخواست‌های تغییر"),
  P("cr.review", "requests", "Approve, reject or amend change requests", "تأیید، رد یا اصلاح درخواست تغییر"),
  P("cr.publish", "requests", "Publish approved change requests", "انتشار درخواست تأییدشده", true),
  P("policies.read", "requests", "Read and simulate approval policies", "خواندن و شبیه‌سازی سیاست‌های تأیید"),
  P("policies.manage", "requests", "Edit approval policies", "ویرایش سیاست‌های تأیید", true),
  P("partners.read", "partners", "See partners and their users", "دیدن شرکا و کاربرانشان"),
  P("partners.manage", "partners", "Create and edit partners and partner users", "مدیریت شرکا و کاربرانشان", true),
  P("grants.read", "partners", "See partner grants", "دیدن دسترسی‌های شرکا"),
  P("grants.manage", "partners", "Give and remove partner grants", "دادن و گرفتن دسترسی شرکا", true),
  P("webhooks.read", "partners", "See webhook deliveries", "دیدن ارسال‌های وب‌هوک"),
  P("webhooks.manage", "partners", "Set webhook URLs and retry deliveries", "تنظیم و تکرار وب‌هوک", true),
  P("audit.read", "audit", "Read and verify the audit log", "خواندن و بررسی گزارش ممیزی"),
  P("audit.export", "audit", "Export the audit log", "خروجی گرفتن از گزارش ممیزی", true),
  P("docs.read", "audit", "Read the API documentation", "خواندن مستندات API"),
  P("users.read", "users", "See operators", "دیدن کاربران"),
  P("users.create", "users", "Create operators", "ساخت کاربر", true),
  P("users.update", "users", "Edit profiles; disable, unlock, reset password and MFA, end sessions", "ویرایش مشخصات، غیرفعال‌سازی، بازکردن قفل، بازنشانی رمز و MFA و پایان نشست‌ها", true),
  P("users.delete", "users", "Delete operators", "حذف کاربر", true),
  P("users.permissions", "users", "Change roles and per-user permissions", "تغییر نقش و دسترسی تک‌تک کاربران", true),
  P("roles.read", "users", "See roles", "دیدن نقش‌ها"),
  P("roles.manage", "users", "Create, edit and delete roles", "مدیریت نقش‌ها", true),
  P("sessions.manage", "users", "See and revoke other people's sessions", "دیدن و لغو نشست‌های دیگران", true),
  P("settings.read", "settings", "Read site settings", "خواندن تنظیمات سایت"),
  P("settings.write", "settings", "Change site settings (company, analytics, security)", "تغییر تنظیمات سایت", true),
  P("seo.read", "seo", "See SEO reports", "دیدن گزارش‌های سئو"),
  P("seo.run", "seo", "Run SEO checks", "اجرای بررسی سئو"),
  P("backup.read", "backup", "See backups", "دیدن پشتیبان‌ها"),
  P("backup.run", "backup", "Make and download backups", "گرفتن و دانلود پشتیبان", true),
  P("backup.restore", "backup", "Restore a backup (replaces data)", "بازگردانی پشتیبان (جایگزینی داده)", true),
  P("backup.configure", "backup", "Configure automatic and remote backups", "تنظیم پشتیبان خودکار و ارسال", true),
  P("blog.read", "blog", "See blog posts and their history", "دیدن مقاله‌ها و تاریخچه‌شان"),
  P("blog.write", "blog", "Write posts and edit your own drafts", "نوشتن مقاله و ویرایش پیش‌نویس‌های خود"),
  P("blog.edit_others", "blog", "Edit other people's posts", "ویرایش مقاله‌های دیگران"),
  P("blog.publish", "blog", "Publish, schedule, unpublish and restore posts", "انتشار، زمان‌بندی، برداشتن و بازگردانی مقاله", true),
  P("blog.manage", "blog", "Manage categories, tags and authors", "مدیریت دسته‌ها، برچسب‌ها و نویسنده‌ها", true),
  P("blog.delete", "blog", "Archive posts", "بایگانی مقاله", true),
  P("blog.comments", "blog", "Moderate and answer comments", "بررسی و پاسخ به کامنت‌ها"),
  P("blog.newsletter", "blog", "See and remove newsletter subscribers", "دیدن و حذف مشترکان خبرنامه", true),
];

export type Permission = string;
export const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));
export const SELF = "self";

/** Built-in roles. They keep the access the old role ranks gave (viewer < auditor < operator < super_admin). */
const VIEWER = ["dashboard.read", "content.read", "preview.use", "media.read", "catalogue.read", "render.read", "forms.read", "teams.read", "cr.read", "policies.read", "docs.read", "settings.read", "seo.read", "blog.read"];
const OPERATOR = [
  ...VIEWER,
  "content.write", "content.publish", "media.upload", "catalogue.write", "catalogue.approve", "catalogue.import", "forms.write", "forms.publish",
  "tickets.read", "tickets.reply", "tickets.manage", "tickets.mailbox", "cr.review", "cr.publish", "partners.read", "grants.read", "webhooks.read", "webhooks.manage",
  "users.read", "roles.read", "seo.run", "backup.read",
  "blog.write", "blog.edit_others", "blog.publish", "blog.manage", "blog.comments",
];
export const BUILTIN_ROLES: Record<string, { name: { en: string; fa: string }; permissions: string[] }> = {
  super_admin: { name: { en: "Super admin", fa: "مدیر کل" }, permissions: PERMISSIONS.map((p) => p.key) },
  operator: { name: { en: "Operator", fa: "اپراتور" }, permissions: OPERATOR },
  auditor: { name: { en: "Auditor", fa: "ممیز" }, permissions: [...VIEWER, "audit.read", "audit.export"] },
  viewer: { name: { en: "Viewer", fa: "بیننده" }, permissions: VIEWER },
  // A freelance writer: drafts and previews own posts, uploads images, sends them for review; cannot publish.
  blog_author: { name: { en: "Blog author", fa: "نویسندهٔ بلاگ" }, permissions: ["dashboard.read", "blog.read", "blog.write", "media.read", "media.upload", "preview.use"] },
};

/**
 * Route → permission. Keys are "METHOD /fastify/path". Kept in one place so a reviewer can read the
 * whole access model at once; `permissions.test.ts` checks every console route is listed.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  // Self service
  "POST /v1/manage/auth/step-up": SELF,
  "GET /v1/manage/auth/me": SELF,
  "GET /v1/manage/auth/csrf": SELF,
  "POST /v1/manage/auth/logout": SELF,
  "POST /v1/manage/auth/password": SELF,
  "GET /v1/manage/sessions": SELF,
  "POST /v1/manage/sessions/:id/revoke": SELF,
  "GET /v1/manage/me/prefs": SELF,
  "PUT /v1/manage/me/prefs": SELF,
  "GET /v1/manage/notifications": SELF,
  "POST /v1/manage/notifications/read": SELF,
  "GET /v1/manage/permissions": SELF,
  // Users and roles
  "GET /v1/manage/operators": "users.read",
  "GET /v1/manage/operators/:id": "users.read",
  "POST /v1/manage/operators": "users.create",
  "PATCH /v1/manage/operators/:id": "users.update",
  "POST /v1/manage/operators/:id/reset-password": "users.update",
  "POST /v1/manage/operators/:id/sessions/revoke": "users.update",
  "GET /v1/manage/operators/:id/activity": "users.read",
  "DELETE /v1/manage/operators/:id": "users.delete",
  "PUT /v1/manage/operators/:id/permissions": "users.permissions",
  "GET /v1/manage/roles": "roles.read",
  "POST /v1/manage/roles": "roles.manage",
  "PUT /v1/manage/roles/:key": "roles.manage",
  "DELETE /v1/manage/roles/:key": "roles.manage",
  // Dashboard, audit, docs
  "GET /v1/manage/dashboard": "dashboard.read",
  "GET /v1/manage/audit": "audit.read",
  "GET /v1/manage/audit/verify": "audit.read",
  "GET /v1/manage/audit/export": "audit.export",
  "GET /v1/manage/docs": "docs.read",
  "GET /v1/manage/docs/opex.json": "docs.read",
  "GET /v1/manage/docs/site.json": "docs.read",
  // Content
  "GET /v1/manage/types": "content.read",
  "GET /v1/manage/types/:key": "content.read",
  "GET /v1/manage/entries": "content.read",
  "GET /v1/manage/entries/:type": "content.read",
  "PUT /v1/manage/entries/:type": "content.write",
  "PATCH /v1/manage/entries/:type": "content.write",
  "POST /v1/manage/entries/:type/publish": "content.publish",
  "POST /v1/manage/entries/:type/rollback": "content.publish",
  "POST /v1/manage/entries/:type/schedule": "content.publish",
  "GET /v1/manage/entries/:type/revisions": "content.read",
  "GET /v1/manage/revisions/:id": "content.read",
  "GET /v1/manage/diff": "content.read",
  "POST /v1/manage/preview": "preview.use",
  // Media
  "POST /v1/manage/media": "media.upload",
  "GET /v1/manage/media": "media.read",
  "GET /v1/manage/media/:file/raw": "media.read",
  // Catalogue and renders
  "POST /v1/manage/catalogue/tube/models": "catalogue.write",
  "GET /v1/manage/catalogue/tube/models": "catalogue.read",
  "PUT /v1/manage/catalogue/tube/models/:id/mounting": "catalogue.write",
  "POST /v1/manage/catalogue/tube/models/:id/approve": "catalogue.approve",
  "POST /v1/manage/catalogue/tube/import": "catalogue.import",
  "POST /v1/manage/render": "render.run",
  "GET /v1/manage/render/jobs": "render.read",
  // Forms
  "GET /v1/manage/forms": "forms.read",
  "POST /v1/manage/forms": "forms.write",
  "GET /v1/manage/forms/:id": "forms.read",
  "PUT /v1/manage/forms/:id/draft": "forms.write",
  "POST /v1/manage/forms/:id/publish": "forms.publish",
  "POST /v1/manage/forms/:id/status": "forms.publish",
  "POST /v1/manage/forms/:id/duplicate": "forms.write",
  "GET /v1/manage/forms/:id/versions/:v": "forms.read",
  // Helpdesk
  "GET /v1/manage/tickets": "tickets.read",
  "GET /v1/manage/tickets/counts": "tickets.read",
  "GET /v1/manage/tickets/:ref": "tickets.read",
  "PATCH /v1/manage/tickets/:ref": "tickets.manage",
  "POST /v1/manage/tickets/:ref/assign": "tickets.manage",
  "POST /v1/manage/tickets/:ref/refer": "tickets.manage",
  "POST /v1/manage/tickets/:ref/notes": "tickets.reply",
  "POST /v1/manage/tickets/:ref/replies": "tickets.reply",
  "POST /v1/manage/tickets/:ref/merge": "tickets.manage",
  "POST /v1/manage/tickets/:ref/spam": "tickets.manage",
  "POST /v1/manage/tickets/bulk": "tickets.manage",
  "GET /v1/manage/tickets/:ref/attachments/:att": "tickets.read",
  "DELETE /v1/manage/tickets/:ref": "tickets.delete",
  "GET /v1/manage/helpdesk/people": "tickets.read",
  "GET /v1/manage/helpdesk/mailbox": "tickets.mailbox",
  "POST /v1/manage/me/availability": "tickets.read",
  "GET /v1/manage/saved-replies": "tickets.read",
  "POST /v1/manage/saved-replies": "tickets.reply",
  "PUT /v1/manage/saved-replies/:id": "tickets.reply",
  "DELETE /v1/manage/saved-replies/:id": "tickets.reply",
  "GET /v1/manage/teams": "teams.read",
  "POST /v1/manage/teams": "teams.manage",
  "PATCH /v1/manage/teams/:id": "teams.manage",
  "PUT /v1/manage/teams/:id/members": "teams.manage",
  "DELETE /v1/manage/teams/:id": "teams.manage",
  // Change requests, policies, partners
  "GET /v1/manage/change-requests": "cr.read",
  "GET /v1/manage/change-requests/:id": "cr.read",
  "POST /v1/manage/change-requests/:id/approve": "cr.review",
  "POST /v1/manage/change-requests/:id/reject": "cr.review",
  "POST /v1/manage/change-requests/:id/amend": "cr.review",
  "POST /v1/manage/change-requests/:id/publish": "cr.publish",
  "GET /v1/manage/grants": "grants.read",
  "POST /v1/manage/grants": "grants.manage",
  "DELETE /v1/manage/grants/:id": "grants.manage",
  "GET /v1/manage/policies": "policies.read",
  "POST /v1/manage/policies/simulate": "policies.read",
  "POST /v1/manage/policies": "policies.manage",
  "PUT /v1/manage/policies/:id": "policies.manage",
  "DELETE /v1/manage/policies/:id": "policies.manage",
  "PUT /v1/manage/partners/:id/webhook": "webhooks.manage",
  "GET /v1/manage/webhooks": "webhooks.read",
  "POST /v1/manage/webhooks/:id/retry": "webhooks.manage",
  "GET /v1/manage/partners": "partners.read",
  "POST /v1/manage/partners": "partners.manage",
  "PATCH /v1/manage/partners/:id": "partners.manage",
  "GET /v1/manage/partners/:id/users": "partners.read",
  "POST /v1/manage/partners/:id/users": "partners.manage",
  "PATCH /v1/manage/partner-users/:uid": "partners.manage",
  // Settings, SEO, backups
  "GET /v1/manage/settings": "settings.read",
  "GET /v1/manage/system/overview": "settings.read",
  "PUT /v1/manage/settings/:section": "settings.write",
  // Blog
  "GET /v1/manage/blog/posts": "blog.read",
  "POST /v1/manage/blog/posts": "blog.write",
  "GET /v1/manage/blog/posts/:id": "blog.read",
  "PUT /v1/manage/blog/posts/:id": "blog.write",
  "DELETE /v1/manage/blog/posts/:id": "blog.delete",
  "POST /v1/manage/blog/posts/:id/submit": "blog.write",
  "POST /v1/manage/blog/posts/:id/publish": "blog.publish",
  "POST /v1/manage/blog/posts/:id/unpublish": "blog.publish",
  "POST /v1/manage/blog/posts/:id/restore": "blog.publish",
  "GET /v1/manage/blog/posts/:id/revisions": "blog.read",
  "GET /v1/manage/blog/posts/:id/revisions/:rev": "blog.read",
  "POST /v1/manage/blog/posts/:id/preview": "preview.use",
  "GET /v1/manage/blog/taxonomy": "blog.read",
  "POST /v1/manage/blog/categories": "blog.manage",
  "PUT /v1/manage/blog/categories/:id": "blog.manage",
  "DELETE /v1/manage/blog/categories/:id": "blog.manage",
  "POST /v1/manage/blog/tags": "blog.write",
  "PUT /v1/manage/blog/tags/:id": "blog.manage",
  "DELETE /v1/manage/blog/tags/:id": "blog.manage",
  "POST /v1/manage/blog/authors": "blog.manage",
  "PUT /v1/manage/blog/authors/:id": "blog.manage",
  "DELETE /v1/manage/blog/authors/:id": "blog.manage",
  "GET /v1/manage/blog/comments": "blog.comments",
  "POST /v1/manage/blog/comments/:id/moderate": "blog.comments",
  "POST /v1/manage/blog/comments/:id/reply": "blog.comments",
  "DELETE /v1/manage/blog/comments/:id": "blog.comments",
  "GET /v1/manage/blog/subscribers": "blog.newsletter",
  "DELETE /v1/manage/blog/subscribers/:id": "blog.newsletter",
  "GET /v1/manage/blog/settings": "blog.read",
  "PUT /v1/manage/blog/settings": "blog.manage",
  "POST /v1/manage/blog/posts/:id/translate": "blog.write",
  "GET /v1/manage/seo/reports": "seo.read",
  "GET /v1/manage/seo/reports/:id": "seo.read",
  "POST /v1/manage/seo/run": "seo.run",
  "GET /v1/manage/backups": "backup.read",
  "POST /v1/manage/backups": "backup.run",
  "GET /v1/manage/backups/:id/download": "backup.run",
  "DELETE /v1/manage/backups/:id": "backup.run",
  "POST /v1/manage/backups/restore": "backup.restore",
  "GET /v1/manage/backups/config": "backup.read",
  "PUT /v1/manage/backups/config": "backup.configure",
  "POST /v1/manage/backups/config/test": "backup.configure",
};

export const permissionFor = (method: string, url: string): Permission | undefined => ROUTE_PERMISSIONS[`${method} ${url}`];

export type PermissionRow = { role: string | null; perm_allow: unknown; perm_deny: unknown };

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && PERMISSION_KEYS.has(x)) : []);

/** Permissions of a role key: built-in ones from code, custom ones from the roles table. */
export async function rolePermissions(q: Q, tenant: string, role: string | null): Promise<string[]> {
  if (!role) return [];
  const builtin = BUILTIN_ROLES[role];
  if (builtin) return builtin.permissions;
  const [r] = await q<{ permissions: unknown }>(`SELECT permissions FROM roles WHERE tenant_id = $1 AND key = $2`, [tenant, role]);
  return list(r?.permissions);
}

/** Role + per-user allow − per-user deny. A super admin always has everything (deny lists cannot lock out the last admin). */
export async function effectivePermissions(q: Q, tenant: string, row: PermissionRow): Promise<Set<string>> {
  if (row.role === "super_admin") return new Set(PERMISSION_KEYS);
  const set = new Set([...(await rolePermissions(q, tenant, row.role)), ...list(row.perm_allow)]);
  for (const d of list(row.perm_deny)) set.delete(d);
  return set;
}
