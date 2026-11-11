#!/usr/bin/env bash
# Encrypted backup of OPEX: database dump + media/keys volume. Run daily from cron on the host:
#   15 2 * * * cd /srv/arapoush && infra/backup.sh >> /var/log/opex-backup.log 2>&1
#
# Needs `age` (https://age-encryption.org) and BACKUP_AGE_RECIPIENT (a public key; keep the private
# key offline). The audit archive is not included: it already lives on write-once storage.
set -euo pipefail
cd "$(dirname "$0")"
: "${BACKUP_DIR:=/srv/opex/backups}"
: "${KEEP_DAYS:=30}"
[ -f .env ] && set -a && . ./.env && set +a
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (age public key)}"
command -v age >/dev/null || { echo "age is not installed" >&2; exit 1; }

compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$BACKUP_DIR"

# 1. Database (custom format: restorable table by table). The audit chain head is recorded too.
compose exec -T postgres pg_dump -U opex -d opex -Fc > "$work/opex.dump"
compose exec -T postgres psql -U opex -d opex -Atc "SELECT seq || ' ' || hash FROM audit_events ORDER BY seq DESC LIMIT 1" > "$work/audit-head.txt"
# 2. Media and keys (the API's /data volume), read through a throwaway container.
docker run --rm -v arapoush_opex_data:/data:ro -v "$work":/out alpine tar -C /data -czf /out/opex-data.tgz .
# 3. One encrypted file, with a checksum next to it.
tar -C "$work" -cf - opex.dump opex-data.tgz audit-head.txt | age -r "$BACKUP_AGE_RECIPIENT" > "$BACKUP_DIR/opex-$stamp.tar.age"
sha256sum "$BACKUP_DIR/opex-$stamp.tar.age" > "$BACKUP_DIR/opex-$stamp.tar.age.sha256"

# Off-site copy (optional): BACKUP_RCLONE_REMOTE=remote:bucket/path
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then rclone copy "$BACKUP_DIR" "$BACKUP_RCLONE_REMOTE" --include "opex-$stamp.*"; fi
find "$BACKUP_DIR" -name 'opex-*.tar.age*' -mtime +"$KEEP_DAYS" -delete
echo "backup ok: opex-$stamp.tar.age ($(du -h "$BACKUP_DIR/opex-$stamp.tar.age" | cut -f1)), audit head $(cat "$work/audit-head.txt")"
