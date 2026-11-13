import type { RouteContract } from "./contract.ts";
import { AUDIT } from "../audit/contract.ts";
import { AUTH } from "../auth/contract.ts";
import { AUTHZ } from "../authz/contract.ts";
import { SETTINGS } from "../settings/contract.ts";
import { BACKUPS } from "../backups/contract.ts";
import { SEO } from "../seo/contract.ts";
import { CATALOGUE } from "../catalogue/contract.ts";
import { CONTENT } from "../content/contract.ts";
import { CR } from "../cr/contract.ts";
import { DOCS } from "../docs/contract.ts";
import { DELIVERY } from "../delivery/contract.ts";
import { FORMS } from "../forms/contract.ts";
import { MEDIA } from "../media/contract.ts";
import { OAUTH } from "../oauth/contract.ts";
import { OPS } from "../ops/contract.ts";
import { PARTNER } from "../partner/contract.ts";
import { PARTNERS } from "../partners/contract.ts";
import { RENDER } from "../render/contract.ts";
import { TICKETS } from "../tickets/contract.ts";

/** Every route contract OPEX serves (one per registered route; checked by openapi.test.ts). */
export const CONTRACTS: RouteContract[] = [AUDIT, AUTH, AUTHZ, SETTINGS, BACKUPS, SEO, CATALOGUE, CONTENT, CR, DELIVERY, DOCS, FORMS, MEDIA, OAUTH, OPS, PARTNER, PARTNERS, RENDER, TICKETS].flatMap((g) => Object.values(g) as RouteContract[]);
