import { z } from "zod";
import { Iso, IsoOrNull, Ok, route } from "../openapi/contract.ts";
import { PARTNER_SCOPES } from "../oauth/contract.ts";

const Cidr = z.string().regex(/^[0-9a-fA-F:.]+\/\d{1,3}$/, "CIDR like 203.0.113.0/24");
const Jwk = z
  .object({ kty: z.enum(["EC", "OKP", "RSA"]), kid: z.string().max(100).optional(), crv: z.string().optional(), x: z.string().optional(), y: z.string().optional(), n: z.string().optional(), e: z.string().optional(), alg: z.string().optional(), use: z.string().optional() })
  .refine((k) => !("d" in k), "Public keys only");
export const ClientBody = z.strictObject({
  name: z.string().min(2).max(120),
  allowed_cidrs: z.array(Cidr).max(50).describe("Networks AraCMS calls from (empty: anywhere)."),
  mtls_fingerprint: z.string().regex(/^[0-9a-fA-F:]{64,95}$/).nullable().optional().describe("SHA-256 of the client certificate, when Caddy mTLS is on."),
  jwks: z.object({ keys: z.array(Jwk).min(1).max(5) }).describe("Public keys for private_key_jwt and request signatures (public parts only)."),
  redirect_uris: z.array(z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "https only")).max(10),
  scopes: z.array(z.enum(PARTNER_SCOPES)).min(1),
  contact: z.string().max(200).optional(),
});
export const ClientPatch = ClientBody.partial().extend({ status: z.enum(["active", "disabled"]).optional() }).strict();
const PartnerRole = z.string().regex(/^[a-z0-9_]{2,40}$/).describe("Partner role key used in grants, e.g. editor");
export const UserBody = z.strictObject({ email: z.string().email().max(200), display_name: z.string().min(2).max(120), role: PartnerRole, password: z.string().max(200) });
export const UserPatch = z.strictObject({ role: PartnerRole.optional(), status: z.enum(["active", "disabled"]).optional(), reset_mfa: z.boolean().optional(), unlock: z.boolean().optional() });

const S = "partners/admin.ts";
const tags = ["Partners"];
const Id = z.object({ id: z.string().max(40) });
const NoPartner = { status: 404, code: "NOT_FOUND", when: "No such partner." };
export const PARTNERS = {
  list: route({
    id: "listPartners",
    method: "GET",
    path: "/v1/manage/partners",
    audience: "manage",
    tags,
    summary: "Partner clients (AraCMS)",
    auth: "session",
    role: "operator",
    source: S,
    responses: {
      200: {
        description: "Oldest first.",
        schema: z.array(z.object({ id: z.string(), client_id: z.string(), name: z.string(), status: z.string(), allowed_cidrs: z.array(z.string()), mtls_fingerprint: z.string().nullable(), redirect_uris: z.array(z.string()), scopes: z.array(z.string()), contact: z.string().nullable(), created_at: Iso, webhook_url: z.string().nullable(), keys: z.number(), users: z.number() })),
      },
    },
  }),
  create: route({
    id: "createPartner",
    method: "POST",
    path: "/v1/manage/partners",
    audience: "manage",
    tags,
    summary: "Register a partner client",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    body: ClientBody,
    responses: { 200: { description: "Created (with its service identity for client_credentials).", schema: z.object({ id: z.string(), client_id: z.string() }) } },
    audit: ["partner.create"],
  }),
  update: route({
    id: "updatePartner",
    method: "PATCH",
    path: "/v1/manage/partners/:id",
    audience: "manage",
    tags,
    summary: "Change a partner (networks, keys, scopes, status…)",
    description: "New keys or disabling end every live session of this partner.",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    params: Id,
    body: ClientPatch,
    responses: { 200: { description: "Updated.", schema: Ok } },
    errors: [NoPartner, { status: 400, code: "NOTHING_TO_CHANGE", when: "No fields given." }],
    audit: ["partner.update", "partner.keys_rotated"],
  }),
  users: route({
    id: "listPartnerUsers",
    method: "GET",
    path: "/v1/manage/partners/:id/users",
    audience: "manage",
    tags,
    summary: "A partner's users",
    auth: "session",
    role: "operator",
    source: S,
    params: Id,
    responses: { 200: { description: "Oldest first.", schema: z.array(z.object({ id: z.string(), email: z.string().nullable(), display_name: z.string(), role: z.string().nullable(), status: z.string(), last_login_at: IsoOrNull, locked_until: IsoOrNull, created_at: Iso, mfa: z.boolean() })) } },
  }),
  createUser: route({
    id: "createPartnerUser",
    method: "POST",
    path: "/v1/manage/partners/:id/users",
    audience: "manage",
    tags,
    summary: "Add a partner user (signs in at /oauth/authorize)",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    params: Id,
    body: UserBody,
    responses: { 200: { description: "Created.", schema: z.object({ id: z.string() }) } },
    errors: [NoPartner, { status: 400, code: "WEAK_PASSWORD", when: "The password fails the policy." }, { status: 409, code: "EMAIL_TAKEN", when: "An account with this email exists." }],
    audit: ["partner_user.create"],
  }),
  updateUser: route({
    id: "updatePartnerUser",
    method: "PATCH",
    path: "/v1/manage/partner-users/:uid",
    audience: "manage",
    tags,
    summary: "Change a partner user's role or status; reset MFA; unlock",
    description: "Disabling or resetting MFA signs the user out everywhere.",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    params: z.object({ uid: z.string().max(40) }),
    body: UserPatch,
    responses: { 200: { description: "Updated.", schema: Ok } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such user." }],
    audit: ["partner_user.update"],
  }),
};
