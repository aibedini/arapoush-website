#!/usr/bin/env bash
# Restores an OPEX backup made by backup.sh, then proves it: audit chain verification, a comparison
# with the write-once archive, and a full website refresh. Used for real recoveries and for the
# quarterly restore drill (docs/opex/runbooks/backup-restore.md).
#   infra/restore.sh /srv/opex/backups/opex-20270115T021500Z.tar.age /path/to/age-identity.txt
set -euo pipefail
cd "$(dirname "$0")"
file=${1:?backup file}
identity=${2:?age identity (private key) file}
[ -f .env ] && set -a && . ./.env && set +a
compose() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }

sha256sum -c "$file.sha256"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
age -d -i "$identity" "$file" | tar -C "$work" -xf -
echo "backup audit head: $(cat "$work/audit-head.txt")"

read -r -p "This replaces the OPEX database and media on this host. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "cancelled"; exit 1; }

compose stop opex-api opex-console
compose up -d postgres
# The audit table refuses UPDATE/DELETE/TRUNCATE, so the database is recreated, not cleaned.
compose exec -T postgres psql -U opex -d postgres -c "DROP DATABASE IF EXISTS opex WITH (FORCE)" -c "CREATE DATABASE opex OWNER opex"
compose exec -T postgres pg_restore -U opex -d opex --no-owner < "$work/opex.dump"
docker run --rm -v arapoush_opex_data:/data -v "$work":/in alpine sh -c "rm -rf /data/* && tar -C /data -xzf /in/opex-data.tgz && chown -R 100:101 /data || true"
compose up -d opex-api opex-console

echo "verifying…"
sleep 10
compose exec -T opex-api node --no-warnings src/cli.ts audit:verify
compose exec -T opex-api node --no-warnings src/cli.ts audit:verify-archive /archive "http://127.0.0.1:4000/.well-known/jwks.json" || echo "WARNING: archive comparison failed; see docs/opex/runbooks/incident-response.md"
compose exec -T opex-api node --no-warnings src/cli.ts site:revalidate
echo "restore done"
