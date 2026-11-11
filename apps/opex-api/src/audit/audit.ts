import { canonical, sha256, ulid } from "../ids.ts";
import type { Db, Q } from "../db/index.ts";

/** Who did it (plan §8.2). */
export type Actor = {
  kind: "operator" | "partner_user" | "service" | "system" | "anonymous";
  id: string | null;
  display?: string;
  roles?: string[];
  via_client?: string | null;
  session_id?: string | null;
  auth?: { method?: string; mfa?: boolean; step_up?: boolean };
};

/** From where (plan §8.2). `ip` is the address OPEX saw after trusted-proxy parsing. */
export type RequestInfo = {
  id: string;
  ip: string | null;
  ip_chain?: string[];
  asserted_end_user_ip?: string | null;
  user_agent?: string | null;
  method?: string;
  path?: string;
};

export type AuditInput = {
  action: string;
  result?: "success" | "failure" | "denied";
  actor: Actor;
  request: RequestInfo;
  resource?: Record<string, unknown> | null;
  changes?: unknown[] | null;
  reason?: string | null;
};

export const SYSTEM_ACTOR: Actor = { kind: "system", id: "system" };
export const SYSTEM_REQUEST: RequestInfo = { id: "system", ip: null };

const GENESIS = "0".repeat(64);

/**
 * Appends one audit event. Must be called inside the same transaction as the change it records,
 * so a change can never commit without its audit row. The per-tenant advisory lock serialises
 * writers, which keeps the hash chain linear.
 */
export async function audit(q: Q, tenant: string, e: AuditInput): Promise<{ id: string; seq: number; hash: string }> {
  await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`audit:${tenant}`]);
  const [last] = await q<{ hash: string }>(`SELECT hash FROM audit_events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1`, [tenant]);
  const [{ ts }] = (await q<{ ts: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ts`)) as [{ ts: string }];
  const record = {
    id: ulid("aud_"),
    ts,
    tenant_id: tenant,
    action: e.action,
    result: e.result ?? "success",
    actor: e.actor,
    request: e.request,
    resource: e.resource ?? null,
    changes: e.changes ?? null,
    reason: e.reason ?? null,
  };
  const prev = last?.hash ?? GENESIS;
  const hash = sha256(prev + canonical(record));
  const [row] = await q<{ seq: string }>(
    `INSERT INTO audit_events (id, ts, tenant_id, action, result, actor, request, resource, changes, reason, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING seq`,
    [record.id, ts, tenant, record.action, record.result, JSON.stringify(record.actor), JSON.stringify(record.request), record.resource && JSON.stringify(record.resource), record.changes && JSON.stringify(record.changes), record.reason, prev, hash],
  );
  return { id: record.id, seq: Number(row!.seq), hash };
}

/** Audit outside a business transaction (logins, denies): its own short transaction. */
export const auditNow = (db: Db, tenant: string, e: AuditInput) => db.tx((q) => audit(q, tenant, e));

/**
 * Recomputes the chain over a range. Any edited, deleted or reordered row breaks it: the first
 * mismatch is reported with its sequence number.
 */
export async function verifyChain(db: Db, tenant: string, from = 1, to?: number): Promise<{ ok: boolean; checked: number; firstBad?: number; head?: { seq: number; hash: string } }> {
  const rows = await db.q<Record<string, unknown>>(
    `SELECT seq, id, to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ts, tenant_id, action, result, actor, request, resource, changes, reason, prev_hash, hash
       FROM audit_events WHERE tenant_id = $1 AND seq >= $2 ${to ? "AND seq <= $3" : ""} ORDER BY seq`,
    to ? [tenant, from, to] : [tenant, from],
  );
  let prev: string | null = null;
  if (from > 1) {
    const [before] = await db.q<{ hash: string }>(`SELECT hash FROM audit_events WHERE tenant_id = $1 AND seq < $2 ORDER BY seq DESC LIMIT 1`, [tenant, from]);
    prev = before?.hash ?? GENESIS;
  }
  for (const r of rows) {
    const expectedPrev: string = prev ?? GENESIS;
    const record = { id: r.id, ts: r.ts, tenant_id: r.tenant_id, action: r.action, result: r.result, actor: r.actor, request: r.request, resource: r.resource ?? null, changes: r.changes ?? null, reason: r.reason ?? null };
    const hash = sha256(String(r.prev_hash) + canonical(record));
    if (r.prev_hash !== expectedPrev || hash !== r.hash) return { ok: false, checked: rows.indexOf(r), firstBad: Number(r.seq) };
    prev = String(r.hash);
  }
  const last = rows[rows.length - 1];
  return { ok: true, checked: rows.length, head: last ? { seq: Number(last.seq), hash: String(last.hash) } : undefined };
}
