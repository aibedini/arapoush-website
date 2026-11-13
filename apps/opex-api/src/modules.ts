import type { Module } from "./app.ts";
import { authModule } from "./auth/routes.ts";
import { oauthModule } from "./oauth/routes.ts";
import { partnerAdminModule } from "./partners/admin.ts";
import { partnerModule } from "./partner/routes.ts";
import { contentModule } from "./content/routes.ts";
import { deliveryModule } from "./delivery/routes.ts";
import { mediaModule } from "./media/routes.ts";
import { auditModule } from "./audit/routes.ts";
import { previewModule } from "./delivery/preview.ts";
import { crManageModule } from "./cr/manage.ts";
import { openApiModule } from "./partner/openapi.ts";
import { formsModule } from "./forms/routes.ts";
import { ticketsModule } from "./tickets/routes.ts";
import { metricsModule } from "./ops/metrics.ts";
import { renderModule } from "./render/routes.ts";
import { docsModule } from "./docs/routes.ts";
import { catalogueModule } from "./catalogue/routes.ts";
import { authzModule } from "./authz/routes.ts";
import { settingsModule } from "./settings/routes.ts";
import { backupsModule } from "./backups/routes.ts";
import { seoModule } from "./seo/routes.ts";

/** Route modules, in registration order. Each phase adds its module here. */
export const MODULES: Module[] = [authModule, oauthModule, partnerAdminModule, partnerModule, contentModule, deliveryModule, mediaModule, auditModule, previewModule, crManageModule, openApiModule, formsModule, ticketsModule, metricsModule, renderModule, docsModule, catalogueModule, authzModule, settingsModule, backupsModule, seoModule];
