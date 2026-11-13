# Backups, restore and the restore drill

There are two backup paths. Use both.

## Console backups (Settings → Backups, S4)

- **Kinds:** *full* (database and media), *content* (pages, forms, media records, settings),
  *database* (every table) and *media* (files only).
- **Format:** a zip encrypted with AES-256-GCM, stored in `BACKUP_DIR` (`BACKUP_PATH` on the host).
  The key is `BACKUP_KEY`, or is derived from `INQUIRY_KEY` when that is unset. Keep the key in the
  password manager: an archive cannot be opened without it.
- **Schedule:** off, daily or weekly at a chosen hour; the newest `keep` archives stay on the server.
- **Remote copy:** SFTP (recommended), FTPS, FTP, S3-compatible storage (AWS, Arvan, MinIO, R2) or
  WebDAV. Remote passwords and secret keys are stored encrypted and never shown again. "Test
  connection" sends a small file.
- **Never included:** sessions, refresh tokens, OAuth codes, replay caches and the audit log. A
  restore therefore cannot rewrite history.
- **Restore** needs `backup.restore`, a fresh step-up and typing `RESTORE`. It works from a stored
  archive or an uploaded `.opexbak` (larger files: copy them into `BACKUP_DIR` and restore by id).
  - A full safety backup (`pre_restore`) is made first. To undo a restore, restore that archive.
  - *Content only* leaves people, tickets and partners as they are.
  - Restoring people signs everyone out.
- **Migration:** `009_permissions_settings_seo_backups.sql` adds the `backups` table. Rolling back
  the code leaves the table unused; drop it only after copying the archives off the server.

## Server backups (`infra/backup.sh`)

For disaster recovery of the whole host.

## What is backed up

| Data | Where | How |
|---|---|---|
| Database (content, revisions, CRs, users, audit, inquiries) | Postgres | `infra/backup.sh`, daily: `pg_dump -Fc` |
| Media files and dev keys | `opex_data` volume | `infra/backup.sh`, daily: tar |
| Audit trail | `AUDIT_ARCHIVE_PATH` | hourly signed JSONL archive, write-once (not in the backup) |
| Secrets | `infra/.env` | **not** in backups: keep in the password manager (two people) |

- **Encryption:** backups are encrypted with `age` to `BACKUP_AGE_RECIPIENT`. The private identity
  lives offline, in the safe and the password manager, never on the server.
- **Off-site copy:** with `BACKUP_RCLONE_REMOTE` set, each backup is also copied off-site.
- **Retention:** `KEEP_DAYS`, 30 by default.

## Write-once audit archive

- The API writes `audit-<tenant>-<from>-<to>.jsonl` plus a `.manifest.jws` every hour.
- Files are created read-only. The manifest holds the range, chain hashes and file digest, and is
  signed with OPEX's ES256 token key, which is published at `/.well-known/jwks.json`.
- Make the directory truly immutable in one of two ways:
  - **S3 Object Lock:** a bucket in compliance mode, retention 7 years, with this cron line:
    `rclone copy $AUDIT_ARCHIVE_PATH s3:opex-audit --immutable`.
  - **WORM volume:** a WORM volume or appliance mounted at `AUDIT_ARCHIVE_PATH`.
- **Verify** (any time; it also checks that the live database still matches every archived range):
  ```bash
  docker compose … exec opex-api node --no-warnings src/cli.ts audit:verify-archive /archive http://127.0.0.1:4000/.well-known/jwks.json
  ```

## Restore

```bash
infra/restore.sh /srv/opex/backups/opex-<stamp>.tar.age /path/to/age-identity.txt
```

The script:
1. checks the checksum and decrypts the backup;
2. asks for confirmation;
3. recreates the database (the audit table refuses deletes, so it is never "cleaned");
4. restores media, then verifies the audit chain;
5. compares the database with the write-once archive;
6. asks the website to refresh every page.

**Expected result:**
- `audit:verify` reports `"ok": true`.
- Archive files later than the backup report "DATABASE DIFFERS FROM ARCHIVE". Their rows were
  written after the backup and are lost from the database, but they stay in the archive as evidence.
  Record them in the incident report.

## Quarterly restore drill

1. **Restore on a staging host,** with a separate `infra/.env`, a different domain and
   `TENANT=arapoush-sandbox`.
2. **Time it.** The target is under 60 minutes from "backup file in hand" to "site and console
   working".
3. **Check the data:**
   - sign in to the console;
   - open three content entries and their revision history;
   - open the audit log;
   - run `audit:verify`.
4. **Check publishing:** publish a test change on staging; the staging site updates within 10 s.
5. **Write it down.** Record in `docs/opex/drills/YYYY-QN.md`:
   - the date and the backup used;
   - the times and the problems found;
   - who took part.
