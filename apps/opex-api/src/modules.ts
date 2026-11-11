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
import { inquiryModule } from "./inquiries/routes.ts";
import { metricsModule } from "./ops/metrics.ts";

/** Route modules, in registration order. Each phase adds its module here. */
export const MODULES: Module[] = [authModule, oauthModule, partnerAdminModule, partnerModule, contentModule, deliveryModule, mediaModule, auditModule, previewModule, crManageModule, openApiModule, inquiryModule, metricsModule];
