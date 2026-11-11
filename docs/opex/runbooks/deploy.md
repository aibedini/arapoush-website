# Deploy and update (one host)

Stack: `infra/docker-compose.prod.yml`, with these services:
- Caddy (TLS, routing, console IP allowlist);
- the website, the OPEX API and the OPEX console;
- Postgres 16 and ClamAV.

Only ports 80 and 443 are public.

## First install

1. **Server:** a Linux host with Docker and the compose plugin.
2. **DNS:** create A/AAAA records for `SITE_DOMAIN`, `OPEX_DOMAIN` and `CONSOLE_DOMAIN`.
3. **Settings and secrets:**
   ```bash
   git clone … /srv/arapoush && cd /srv/arapoush
   cp infra/.env.example infra/.env && chmod 600 infra/.env
   docker compose -f infra/docker-compose.prod.yml --env-file infra/.env build opex-api
   docker compose -f infra/docker-compose.prod.yml --env-file infra/.env run --rm --no-deps opex-api \
     node --no-warnings src/cli.ts keys:generate      # paste the output into infra/.env
   ```
   Fill in the rest of `infra/.env`:
   - the domains and ACME email;
   - `POSTGRES_PASSWORD` (`openssl rand -base64 32`);
   - SMTP;
   - `CONSOLE_ALLOW` and `CONSOLE_ALLOWED_CIDRS`: the office and VPN ranges.
4. **Archive storage:** create `AUDIT_ARCHIVE_PATH` on write-once storage, either a WORM volume or a
   directory synced to S3 with Object Lock (see `backup-restore.md`).
5. **Start:**
   ```bash
   docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build
   ```
   The API migrates the database and imports the website's content on first start.
6. **First super admin.** Use a strong passphrase; the authenticator is set up at first sign-in:
   ```bash
   docker compose … exec -e OPEX_NEW_PASSWORD='…' opex-api node --no-warnings src/cli.ts create-operator you@arapoush.com "Your Name" super_admin
   ```
7. **Check:**
   - `https://SITE_DOMAIN/fa` loads;
   - `https://CONSOLE_DOMAIN` (from an allowed IP) asks for sign-in;
   - `https://OPEX_DOMAIN/v1/manage/auth/me` returns 404 (internal routes are hidden).
8. **Ongoing jobs:**
   - schedule `infra/backup.sh` (cron);
   - point Prometheus at `opex-api:4000/metrics` with `METRICS_TOKEN` (see `alerts.md`).

## Update

```bash
cd /srv/arapoush && git fetch && git checkout <release tag>
infra/backup.sh                                   # always back up first
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build
docker compose … exec opex-api node --no-warnings src/cli.ts site:revalidate
```

- Migrations run on API start, inside transactions; a failed migration leaves the old schema and the
  API refuses to start.
- To roll back, check out the previous tag and rebuild.
- Migrations only add columns and tables, so the previous release runs on the newer schema. If a
  release ever says otherwise, restore the backup taken in step 2 (`backup-restore.md`).

## The website alone (no OPEX)

`install.sh` and the single `Dockerfile` keep working: without the OPEX variables the site renders
from its own files.
