import { z } from "zod";
import { Iso, Ok, route } from "../openapi/contract.ts";

const S = "authz/routes.ts";
const tags = ["Operators"];
const PermList = z.array(z.string().max(60)).max(200);
const RoleKey = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);
export const RoleBody = z.strictObject({ key: RoleKey, name: z.string().min(2).max(80), description: z.string().max(400).default(""), permissions: PermList });
export const RoleUpdate = RoleBody.omit({ key: true });
export const OperatorPermissionsBody = z.strictObject({
  allow: PermList.describe("Permissions given to this operator on top of the role."),
  deny: PermList.describe("Permissions taken away from this operator even if the role has them."),
});
const Escalation = { status: 403, code: "ESCALATION", when: "You cannot give permissions you do not have." };
const Unknown = { status: 400, code: "UNKNOWN_PERMISSION", when: "A permission key is not in the catalogue." };

export const AUTHZ = {
  permissions: route({
    id: "listPermissions",
    method: "GET",
    path: "/v1/manage/permissions",
    audience: "manage",
    tags,
    summary: "The permission catalogue and built-in roles",
    description: "Every console function has one permission. The console uses this list to draw the per-user permission editor.",
    auth: "session",
    role: "viewer",
    source: S,
    responses: {
      200: {
        description: "Catalogue, grouped by area.",
        schema: z.object({
          permissions: z.array(z.object({ key: z.string(), group: z.string(), label: z.object({ en: z.string(), fa: z.string() }), danger: z.boolean().optional() })),
          builtin: z.array(z.object({ key: z.string(), name: z.object({ en: z.string(), fa: z.string() }), permissions: z.array(z.string()) })),
          routes: z.record(z.string(), z.string()).describe("METHOD /path → permission"),
        }),
      },
    },
  }),
  operator: route({
    id: "getOperator",
    method: "GET",
    path: "/v1/manage/operators/:id",
    audience: "manage",
    tags,
    summary: "One operator with role, own permissions and effective permissions",
    auth: "session",
    role: "operator",
    source: S,
    params: z.object({ id: z.string().max(40) }),
    responses: {
      200: {
        description: "The operator.",
        schema: z.object({ id: z.string(), email: z.string().nullable(), display_name: z.string(), role: z.string(), status: z.string(), perm_allow: z.array(z.string()), perm_deny: z.array(z.string()), effective: z.array(z.string()) }),
      },
    },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such operator." }],
  }),
  setOperatorPermissions: route({
    id: "setOperatorPermissions",
    method: "PUT",
    path: "/v1/manage/operators/:id/permissions",
    audience: "manage",
    tags,
    summary: "Set an operator's own allowed and denied permissions",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    params: z.object({ id: z.string().max(40) }),
    body: OperatorPermissionsBody,
    responses: { 200: { description: "Saved; applies to their next request.", schema: Ok } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such operator." }, { status: 403, code: "SELF_CHANGE", when: "You cannot change your own permissions." }, Escalation, Unknown],
    audit: ["operator.permissions"],
  }),
  roles: route({
    id: "listRoles",
    method: "GET",
    path: "/v1/manage/roles",
    audience: "manage",
    tags,
    summary: "Built-in and custom roles",
    auth: "session",
    role: "operator",
    source: S,
    responses: {
      200: {
        description: "Built-in roles first.",
        schema: z.array(z.object({ key: z.string(), name: z.string(), description: z.string(), permissions: z.array(z.string()), builtin: z.boolean(), members: z.number().int(), updated_at: Iso.nullable() })),
      },
    },
  }),
  createRole: route({
    id: "createRole",
    method: "POST",
    path: "/v1/manage/roles",
    audience: "manage",
    tags,
    summary: "Create a custom role",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    body: RoleBody,
    responses: { 200: { description: "Created.", schema: Ok } },
    errors: [{ status: 409, code: "ROLE_EXISTS", when: "The key is taken (or is a built-in role)." }, Escalation, Unknown],
    audit: ["role.create"],
  }),
  updateRole: route({
    id: "updateRole",
    method: "PUT",
    path: "/v1/manage/roles/:key",
    audience: "manage",
    tags,
    summary: "Change a custom role",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    params: z.object({ key: RoleKey }),
    body: RoleUpdate,
    responses: { 200: { description: "Saved; members get it on their next request.", schema: Ok } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such custom role (built-in roles cannot be changed)." }, Escalation, Unknown],
    audit: ["role.update"],
  }),
  deleteRole: route({
    id: "deleteRole",
    method: "DELETE",
    path: "/v1/manage/roles/:key",
    audience: "manage",
    tags,
    summary: "Delete a custom role",
    auth: "session",
    role: "super_admin",
    stepUp: true,
    source: S,
    params: z.object({ key: RoleKey }),
    responses: { 200: { description: "Deleted.", schema: Ok } },
    errors: [{ status: 404, code: "NOT_FOUND", when: "No such custom role." }, { status: 409, code: "ROLE_IN_USE", when: "Operators still have this role." }],
    audit: ["role.delete"],
  }),
};
