# Incident response

First hour: **contain, preserve evidence, then investigate.** Never "clean up" audit data: the table
refuses it, and the archive keeps a copy.

## Suspected AraCMS compromise (stolen keys, odd change requests)

1. **Cut access.** In the console, go to Partners → AraCMS → "Disable access". All AraCMS sessions
   and tokens end immediately, and new tokens are refused.
2. **Review the queue.** In Requests, reject open requests you don't recognise. Every decision is
   audited.
3. **Find what changed.** In the audit log, filter by client = the AraCMS client id and the last 7
   days. Export the JSONL (this needs step-up).
4. **Undo published changes.** For each published entry, open its revisions and roll back to the
   last good one.
5. **Re-enable** after AraCMS has new keys. Rotate the client key and webhook secret
   (`key-rotation.md`).

## Suspected operator account compromise

1. **Lock the account.** A super admin opens Operators → the account → Disable; its sessions end.
2. **Review its activity.** Filter the audit log by actor and roll back unwanted publishes.
3. **Restore access.** Reset its authenticator, set a new password, and re-enable after talking to
   the person.

## Audit chain broken (`opex_audit_chain_ok = 0`, or "Verify chain" fails)

This means someone changed the database outside OPEX.
1. **Don't restart or migrate anything.** Snapshot the database volume (`docker compose stop
   postgres`, copy the volume) and keep the snapshot.
2. **Find out what changed.** Run `audit:verify-archive` to see which archived range differs. Compare
   the archive rows with the database rows at `firstBad`; that shows what was altered.
3. **Rotate every secret** (`key-rotation.md`) and the Postgres password. Check host access logs.
4. **Restore from the last backup before `firstBad`** (`backup-restore.md`). Rows after it remain in
   the archive.

## Website shows wrong content

1. **Check whether it was a legitimate publish.** Look in the audit log for `content.publish`.
2. **Roll back.** In Content → the entry → Revisions, roll back to the last good revision. The site
   updates in seconds.
3. **If the site doesn't update,** check the webhook page for failed deliveries, then run
   `site:revalidate`.

## Leaked secret (in chat, a commit, a screenshot)

Rotate it now (`key-rotation.md`). If it was committed, also rewrite or revoke wherever it was
pushed. Rotating comes first, either way.

## After every incident

Write `docs/opex/incidents/YYYY-MM-DD-<name>.md`:
- the timeline (from the audit log), the impact and the root cause;
- the fixes, with owners.
