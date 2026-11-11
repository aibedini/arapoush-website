import type { Module } from "./app.ts";
import { authModule } from "./auth/routes.ts";
import { oauthModule } from "./oauth/routes.ts";
import { partnerAdminModule } from "./partners/admin.ts";
import { partnerModule } from "./partner/routes.ts";

/** Route modules, in registration order. Each phase adds its module here. */
export const MODULES: Module[] = [authModule, oauthModule, partnerAdminModule, partnerModule];
