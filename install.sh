#!/usr/bin/env bash
# Arapoush website — one-line installer for any Linux server (VPS, dedicated, VM).
#
#   curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo bash
#
# With a domain (automatic HTTPS through Caddy):
#   curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo DOMAIN=arapoush.com bash
#
# Website + OPEX console/API (Docker, Postgres, backups, settings) — the full platform:
#   curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo MODE=full DOMAIN=arapoush.com bash
#
# Run it in a terminal without options and it asks (mode, domain, …). Afterwards `sudo arapoush`
# opens a menu: status, update, check, rollback, restart, logs, backup, admin, uninstall.
#
# Update to the newest release (keeps DOMAIN, PORT, … from the first install):
#   sudo arapoush update            # or: sudo arapoush update v1.2.0 / sudo arapoush update main
#
# Options (environment variables; saved in /etc/arapoush.conf and reused by updates):
#   MODE=site|full         site: the website only (Node, no database). full: website + OPEX in Docker
#   DOMAIN=example.com     serve on 80/443 with a free Let's Encrypt certificate (DNS must point here)
#   WWW=1                  also answer on www.DOMAIN and redirect it to DOMAIN
#   PORT=80                public port when no DOMAIN is set (default 80)
#   SITE_URL=https://...   canonical URL for SEO (default https://DOMAIN, or http://SERVER-IP)
#   VERSION=latest         what to deploy: latest (newest v* release tag), a tag like v1.2.0, or a branch
#   BRANCH=main            branch used while the repository has no releases yet
#   AUTO_UPDATE=1          install new releases automatically every night (systemd only)
#   FORCE=1                rebuild even when that version is already running
#   APP_DIR=/opt/arapoush  install location
#   NODE_MIRROR=...        Node.js download mirror (default https://nodejs.org/dist)
#   NPM_REGISTRY=...       npm registry mirror (e.g. for servers with slow access to npmjs.org)
#   NO_SWAP=1              don't add a swap file on small servers
#   UNINSTALL=1            remove the service, Caddy config and APP_DIR
set -Eeuo pipefail

# Settings from the first install; anything passed explicitly this time wins.
CONF=/etc/arapoush.conf
SAVED_KEYS="MODE DOMAIN WWW PORT APP_PORT SITE_URL BRANCH APP_DIR NODE_MIRROR NPM_REGISTRY AUTO_UPDATE"
if [ -f "$CONF" ] && [ "${UNINSTALL:-0}" != "1" ]; then
  while IFS='=' read -r key value; do
    case " $SAVED_KEYS " in *" $key "*) [ -n "${!key:-}" ] || printf -v "$key" '%s' "$value" ;; esac
  done < "$CONF"
fi

REPO_URL="${REPO_URL:-https://github.com/aibedini/arapoush-website.git}"
BRANCH="${BRANCH:-main}"
VERSION="${VERSION:-latest}"
AUTO_UPDATE="${AUTO_UPDATE:-0}"
MODE="${MODE:-}"
APP_DIR="${APP_DIR:-}"
APP_USER="${APP_USER:-arapoush}"
SERVICE="arapoush"
DOMAIN="${DOMAIN:-}"
WWW="${WWW:-0}"
PORT="${PORT:-80}"
APP_PORT="${APP_PORT:-3000}"
SITE_URL="${SITE_URL:-}"
NODE_MAJOR="${NODE_MAJOR:-22}"
NODE_MIRROR="${NODE_MIRROR:-https://nodejs.org/dist}"
NPM_REGISTRY="${NPM_REGISTRY:-}"
NODE_HOME="/usr/local/lib/arapoush-node"

c_info=$'\033[1;34m'; c_ok=$'\033[1;32m'; c_warn=$'\033[1;33m'; c_err=$'\033[1;31m'; c_off=$'\033[0m'
log()  { printf '%s==>%s %s\n' "$c_info" "$c_off" "$*"; }
ok()   { printf '%s✔%s %s\n' "$c_ok" "$c_off" "$*"; }
warn() { printf '%s!%s %s\n' "$c_warn" "$c_off" "$*" >&2; }
die()  { printf '%s✘ %s%s\n' "$c_err" "$*" "$c_off" >&2; exit 1; }
trap 'die "Failed at line $LINENO: $BASH_COMMAND"' ERR

have() { command -v "$1" >/dev/null 2>&1; }

# Questions go to the terminal even under `curl | bash`; without one the default is used.
ask() {
  local ans=""
  if [ -r /dev/tty ] && [ -w /dev/tty ] && [ "${NONINTERACTIVE:-0}" != 1 ]; then
    printf "%s [%s]: " "$1" "$2" > /dev/tty; IFS= read -r ans < /dev/tty || ans=""
  fi
  printf "%s" "${ans:-$2}"
}

# First install in a terminal with no options: ask what to install.
if [ -z "$MODE" ] && [ ! -f "$CONF" ] && [ "${UNINSTALL:-0}" != 1 ] && [ -r /dev/tty ] && [ "${NONINTERACTIVE:-0}" != 1 ]; then
  printf "
%sArapoush installer%s
  1) Website only — fast, no database (content as built)
  2) Full platform — website + OPEX console, API, database, backups (Docker)
" "$c_info" "$c_off" > /dev/tty
  case "$(ask "Choose" 1)" in 2) MODE=full ;; *) MODE=site ;; esac
  [ -n "$DOMAIN" ] || DOMAIN="$(ask "Domain (empty: serve on this server IP over http)" "")"
  [ "$MODE" = full ] || [ -z "$DOMAIN" ] || { case "$(ask "Also answer on www.$DOMAIN? (y/n)" n)" in y|Y) WWW=1 ;; esac; }
  [ "$MODE" = full ] || { case "$(ask "Install new releases automatically every night? (y/n)" n)" in y|Y) AUTO_UPDATE=1 ;; esac; }
fi
MODE="${MODE:-site}"
[ "$MODE" = site ] || [ "$MODE" = full ] || die "MODE must be site or full"
[ -n "$APP_DIR" ] || { [ "$MODE" = full ] && APP_DIR=/srv/arapoush || APP_DIR=/opt/arapoush; }

[ "$(id -u)" -eq 0 ] || die "Run as root, e.g.: curl -fsSL <url>/install.sh | sudo bash"
[ "$(uname -s)" = "Linux" ] || die "This installer is for Linux."

# ── Init system ────────────────────────────────────────────────────────────
INIT=none
if have systemctl && [ -d /run/systemd/system ]; then INIT=systemd
elif have rc-service; then INIT=openrc
fi

# ── Uninstall ──────────────────────────────────────────────────────────────
if [ "${UNINSTALL:-0}" = "1" ]; then
  log "Removing Arapoush"
  if [ "$INIT" = systemd ]; then
    systemctl disable --now "$SERVICE" caddy-arapoush arapoush-update.timer 2>/dev/null || true
    rm -f "/etc/systemd/system/$SERVICE.service" /etc/systemd/system/caddy-arapoush.service \
      /etc/systemd/system/arapoush-update.service /etc/systemd/system/arapoush-update.timer
    systemctl daemon-reload
  elif [ "$INIT" = openrc ]; then
    rc-service "$SERVICE" stop 2>/dev/null || true; rc-update del "$SERVICE" 2>/dev/null || true
    rc-service caddy-arapoush stop 2>/dev/null || true; rc-update del caddy-arapoush 2>/dev/null || true
    rm -f "/etc/init.d/$SERVICE" /etc/init.d/caddy-arapoush
  fi
  rm -rf "$APP_DIR" /etc/caddy/Caddyfile.arapoush "$NODE_HOME" "$CONF" /usr/local/bin/arapoush
  ok "Removed. (The '$APP_USER' user and Caddy binary were left in place.)"
  exit 0
fi

# ── Packages ───────────────────────────────────────────────────────────────
PM=""
for p in apt-get dnf yum zypper pacman apk; do have "$p" && { PM=$p; break; }; done
[ -n "$PM" ] || warn "No known package manager found; assuming git, curl, tar and xz are installed."

pkg_install() {
  case "$PM" in
    apt-get) DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null ;;
    dnf)     dnf install -y -q "$@" >/dev/null ;;
    yum)     yum install -y -q "$@" >/dev/null ;;
    zypper)  zypper --non-interactive --quiet install "$@" >/dev/null ;;
    pacman)  pacman -Sy --noconfirm --needed "$@" >/dev/null ;;
    apk)     apk add --no-cache "$@" >/dev/null ;;
  esac
}

need=()
have git  || need+=(git)
have curl || need+=(curl)
have tar  || need+=(tar)
have xz   || need+=(xz)
[ -f /etc/ssl/certs/ca-certificates.crt ] || [ -d /etc/pki/tls/certs ] || need+=(ca-certificates)
if [ ${#need[@]} -gt 0 ] && [ -n "$PM" ]; then
  if [ "$PM" = apt-get ]; then need=("${need[@]/xz/xz-utils}"); fi
  log "Installing ${need[*]}"
  pkg_install "${need[@]}"
fi

# ── Helper command (`arapoush`, with a menu) ─────────────────────────────────
write_helper() {
cat > /usr/local/bin/arapoush <<'HELPER'
#!/usr/bin/env bash
# Arapoush helper, written by install.sh. Run with no arguments for the menu.
set -uo pipefail
CONF=/etc/arapoush.conf
REPO="https://github.com/aibedini/arapoush-website.git"
INSTALLER="https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh"
val() { sed -n "s/^$1=//p" "$CONF" 2>/dev/null | tail -n1; }
MODE="$(val MODE)"; MODE="${MODE:-site}"
APP_DIR="$(val APP_DIR)"; [ -n "$APP_DIR" ] || { [ "$MODE" = full ] && APP_DIR=/srv/arapoush || APP_DIR=/opt/arapoush; }
B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'

as_root() { [ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"; }
systemd() { command -v systemctl >/dev/null && [ -d /run/systemd/system ]; }
compose() { docker compose -f "$APP_DIR/infra/docker-compose.prod.yml" --env-file "$APP_DIR/infra/.env" "$@"; }
envv() { sed -n "s/^$1=//p" "$APP_DIR/infra/.env" 2>/dev/null | tail -n1; }
latest() { git ls-remote --tags --refs "$REPO" 'v*' | awk -F/ '{print $NF}' | sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n1; }
current() {
  if [ "$MODE" = full ]; then git -C "$APP_DIR" describe --tags --always 2>/dev/null
  else sed -n 's/^version=//p' "$APP_DIR/current/.arapoush-release" 2>/dev/null; fi
}
site_url() { if [ "$MODE" = full ]; then echo "https://$(envv SITE_DOMAIN)"; else sed -n "s/^SITE_URL=//p" "$CONF" 2>/dev/null; fi; }
confirm() { local a; read -r -p "$1 [y/N] " a </dev/tty; [ "$a" = y ] || [ "$a" = Y ]; }

cmd_update() {
  as_root update "$@"
  echo "${B}Updating to ${1:-latest}…${N}"
  curl -fsSL "$INSTALLER" | MODE="$MODE" APP_DIR="$APP_DIR" VERSION="${1:-latest}" bash
}
cmd_check() {
  local l c; l="$(latest)"; c="$(current)"
  if [ -n "$l" ] && [ "$l" != "$c" ]; then echo "${Y}Update available:${N} $c → $l   (sudo arapoush update)"
  else echo "${G}Up to date:${N} $c"; fi
}
cmd_status() {
  echo "${B}Mode:${N} $MODE   ${B}Version:${N} $(current)   ${B}Folder:${N} $APP_DIR"
  local url; url="$(site_url)"
  local code; code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$url/fa" || true)"
  [ "$code" = 200 ] && echo "${G}●${N} Site $url/fa answers 200" || echo "${R}●${N} Site $url/fa answers $code"
  if [ "$MODE" = full ]; then compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
  elif systemd; then systemctl --no-pager --lines=0 status arapoush caddy-arapoush 2>/dev/null | grep -E '●|Active:' || true
  else rc-service arapoush status 2>/dev/null || true; fi
  df -h "$APP_DIR" | tail -n1 | awk '{print "Disk: " $4 " free of " $2}'
}
cmd_restart() {
  as_root restart
  if [ "$MODE" = full ]; then compose restart
  elif systemd; then systemctl restart arapoush; else rc-service arapoush restart; fi
  echo "${G}Restarted${N}"
}
cmd_logs() {
  if [ "$MODE" = full ]; then compose logs -f --tail=100 ${1:-}
  elif command -v journalctl >/dev/null; then journalctl -u arapoush -f; else tail -f /var/log/arapoush.log; fi
}
cmd_rollback() {
  as_root rollback
  if [ "$MODE" = full ]; then
    local now prev; now="$(git -C "$APP_DIR" describe --tags --abbrev=0 2>/dev/null)"
    prev="$(git -C "$APP_DIR" tag -l 'v*' | sort -t. -k1.2,1n -k2,2n -k3,3n | grep -B1 -xF "$now" | head -n1)"
    [ -n "$prev" ] && [ "$prev" != "$now" ] || { echo "No earlier release to go back to."; return 1; }
    confirm "Go back from $now to $prev? (the database stays as it is)" || return 0
    git -C "$APP_DIR" checkout -q "$prev" && compose up -d --build --remove-orphans && echo "${G}Rolled back to $prev${N}"
  else
    local now prev; now="$(readlink -f "$APP_DIR/current")"
    prev="$(ls -1dt "$APP_DIR"/releases/*/ | sed 's#/$##' | grep -vxF "$now" | head -n1 || true)"
    [ -n "$prev" ] || { echo "No previous release to go back to."; return 1; }
    ln -sfn "$prev" "$APP_DIR/current" && { systemd && systemctl restart arapoush || rc-service arapoush restart; }
    echo "${G}Rolled back to $(basename "$prev")${N}"
  fi
}
cmd_backup() {
  as_root backup
  [ "$MODE" = full ] || { echo "The website-only install keeps no data of its own (content is built in). Nothing to back up."; return 0; }
  local stamp dir; stamp="$(date -u +%Y%m%dT%H%M%SZ)"; dir="$APP_DIR/db-dumps"; mkdir -p "$dir"
  if [ -n "$(envv BACKUP_AGE_RECIPIENT)" ] && command -v age >/dev/null; then
    (cd "$APP_DIR/infra" && BACKUP_DIR="$APP_DIR/server-backups" ./backup.sh) && echo "${G}Encrypted server backup written to $APP_DIR/server-backups${N}"
  else
    (umask 077; compose exec -T postgres pg_dump -U opex -d opex -Fc > "$dir/manual-$stamp.dump") && echo "${G}Database dump: $dir/manual-$stamp.dump${N}"
    echo "Encrypted backups with media, schedules and FTP/SFTP/S3 copies: Console → پشتیبان‌گیری."
  fi
}
cmd_admin() {
  as_root admin
  [ "$MODE" = full ] || { echo "Only the full platform has a console."; return 1; }
  local email name pass
  read -r -p "Admin email: " email </dev/tty; read -r -p "Display name: " name </dev/tty
  pass="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  compose exec -T -e OPEX_NEW_PASSWORD="$pass" opex-api node --no-warnings src/cli.ts create-operator "$email" "${name:-Admin}" super_admin \
    && echo "${G}Created.${N} Temporary password: ${B}$pass${N} (change it after the first sign-in)"
}
cmd_config() {
  as_root config
  if [ "$MODE" = full ]; then "${EDITOR:-nano}" "$APP_DIR/infra/.env" && confirm "Apply now (restart the stack)?" && compose up -d
  else "${EDITOR:-nano}" "$CONF" && echo "Apply with: sudo arapoush update"; fi
}
cmd_uninstall() {
  as_root uninstall
  if [ "$MODE" = full ]; then
    confirm "Stop and remove the platform containers? (data volumes and $APP_DIR are kept)" || return 0
    compose down && rm -f /usr/local/bin/arapoush "$CONF" && echo "Removed. Data is still in Docker volumes and $APP_DIR."
  else
    confirm "Remove the Arapoush website?" || return 0
    curl -fsSL "$INSTALLER" | UNINSTALL=1 bash
  fi
}

menu() {
  while true; do
    echo
    echo "${B}Arapoush ($MODE) — $(current)${N}   $(site_url)"
    echo "  1) Status            2) Check for updates   3) Update to latest"
    echo "  4) Update to a version / branch             5) Roll back"
    echo "  6) Restart           7) Logs                8) Backup now"
    [ "$MODE" = full ] && echo "  9) Create console admin                    10) Edit settings (.env)" || echo "  10) Edit settings"
    echo "  11) Uninstall        0) Exit"
    local c v; read -r -p "> " c </dev/tty || return 0
    case "$c" in
      1) cmd_status ;; 2) cmd_check ;; 3) cmd_update latest ;;
      4) read -r -p "Version (e.g. v1.1.0) or branch: " v </dev/tty; [ -n "$v" ] && cmd_update "$v" ;;
      5) cmd_rollback ;; 6) cmd_restart ;; 7) cmd_logs ;; 8) cmd_backup ;; 9) cmd_admin ;; 10) cmd_config ;; 11) cmd_uninstall ;;
      0|q|"") return 0 ;;
      *) echo "?" ;;
    esac
  done
}

case "${1:-}" in
  "") if [ -t 0 ] || [ -r /dev/tty ]; then menu; else cmd_status; fi ;;
  update) shift; cmd_update "${1:-latest}" ;;
  check) cmd_check ;;
  status) cmd_status ;;
  version) current ;;
  releases) [ "$MODE" = full ] && git -C "$APP_DIR" tag -l 'v*' || ls -1t "$APP_DIR/releases" ;;
  rollback) cmd_rollback ;;
  restart) cmd_restart ;;
  logs) shift; cmd_logs "${1:-}" ;;
  backup) cmd_backup ;;
  admin) cmd_admin ;;
  config) cmd_config ;;
  uninstall) cmd_uninstall ;;
  menu) menu ;;
  *) echo "Usage: arapoush [menu|status|check|update [latest|vX.Y.Z|branch]|rollback|restart|logs [service]|backup|admin|config|version|releases|uninstall]" ;;
esac
HELPER
chmod 755 /usr/local/bin/arapoush
}

# ── Full platform: website + OPEX (console, API, Postgres, ClamAV) in Docker ──
# MODE=full. Everything runs from docker compose (infra/docker-compose.prod.yml) under $APP_DIR, with
# secrets generated once into infra/.env. Updates take a database dump first and roll back the code
# if the new version does not come up.
compose() { docker compose -f "$APP_DIR/infra/docker-compose.prod.yml" --env-file "$APP_DIR/infra/.env" "$@"; }
set_env() { # set_env KEY VALUE — replaces or appends one line of infra/.env (values may hold / & ' ")
  local f="$APP_DIR/infra/.env" tmp; tmp="$(mktemp)"
  grep -v "^$1=" "$f" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  cat "$tmp" > "$f"; rm -f "$tmp"
}
get_env() { sed -n "s/^$1=//p" "$APP_DIR/infra/.env" 2>/dev/null | tail -n1; }

full_install() {
  log "Full platform: website + OPEX console and API (Docker)"
  if ! have docker || ! docker compose version >/dev/null 2>&1; then
    log "Installing Docker and the compose plugin"
    case "$PM" in
      apt-get) pkg_install docker.io && { pkg_install docker-compose-v2 2>/dev/null || pkg_install docker-compose-plugin 2>/dev/null || true; } ;;
      dnf|yum) pkg_install docker docker-compose-plugin 2>/dev/null || pkg_install moby-engine docker-compose 2>/dev/null || true ;;
      pacman)  pkg_install docker docker-compose ;;
      apk)     pkg_install docker docker-cli-compose ;;
      zypper)  pkg_install docker docker-compose ;;
    esac
    if ! docker compose version >/dev/null 2>&1; then
      warn "The distribution's packages did not provide 'docker compose'; using Docker's official script."
      curl -fsSL https://get.docker.com | sh >/dev/null
    fi
    if [ "$INIT" = systemd ]; then systemctl enable --now docker -q; elif [ "$INIT" = openrc ]; then rc-update add docker default >/dev/null 2>&1 || true; rc-service docker start >/dev/null || true; fi
  fi
  docker compose version >/dev/null 2>&1 || die "Docker with the compose plugin is required for MODE=full"
  have openssl || pkg_install openssl

  # Source at the chosen release (or branch).
  if [ "$VERSION" = latest ]; then
    REF="$(git ls-remote --tags --refs "$REPO_URL" 'v*' | awk -F/ '{print $NF}' | sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n1)"
    [ -n "$REF" ] || REF="$BRANCH"
  else REF="$VERSION"; fi
  if [ -d "$APP_DIR/.git" ]; then
    PREV_REF="$(git -C "$APP_DIR" rev-parse HEAD)"
    git -C "$APP_DIR" fetch -q --tags origin
    git -C "$APP_DIR" checkout -q "$REF" 2>/dev/null || git -C "$APP_DIR" checkout -q "origin/$REF"
  else
    PREV_REF=""
    [ ! -e "$APP_DIR" ] || [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ] || die "$APP_DIR exists and is not a full-platform install. Use APP_DIR=/srv/arapoush or remove it."
    git clone -q "$REPO_URL" "$APP_DIR"
    git -C "$APP_DIR" checkout -q "$REF"
  fi
  SHA="$(git -C "$APP_DIR" rev-parse --short HEAD)"

  # First install: settings and secrets.
  local envf="$APP_DIR/infra/.env"
  if [ ! -f "$envf" ]; then
    [ -n "$DOMAIN" ] || die "MODE=full needs DOMAIN (the site's domain), e.g. DOMAIN=arapoush.com"
    cp "$APP_DIR/infra/.env.example" "$envf"; chmod 600 "$envf"
    local client_ip; client_ip="$(printf '%s' "${SSH_CLIENT:-}" | awk '{print $1}')"
    [ -n "$client_ip" ] || client_ip="$(who -m 2>/dev/null | sed -n 's/.*(\([0-9a-fA-F.:]*\)).*/\1/p')"
    OPEX_DOMAIN="${OPEX_DOMAIN:-$(ask "OPEX API domain" "opex.$DOMAIN")}"
    CONSOLE_DOMAIN="${CONSOLE_DOMAIN:-$(ask "Console domain" "console.$DOMAIN")}"
    ACME_EMAIL="${ACME_EMAIL:-$(ask "Email for Let's Encrypt" "admin@$DOMAIN")}"
    local def_allow="0.0.0.0/0 ::/0"; [ -z "$client_ip" ] || { case "$client_ip" in *:*) def_allow="$client_ip/128" ;; *) def_allow="$client_ip/32" ;; esac; }
    CONSOLE_ALLOW="${CONSOLE_ALLOW:-$(ask "Networks allowed to open the console (space separated CIDRs)" "$def_allow")}"
    set_env SITE_DOMAIN "$DOMAIN"; set_env OPEX_DOMAIN "$OPEX_DOMAIN"; set_env CONSOLE_DOMAIN "$CONSOLE_DOMAIN"; set_env ACME_EMAIL "$ACME_EMAIL"
    set_env CONSOLE_ALLOW "$CONSOLE_ALLOW"; set_env CONSOLE_ALLOWED_CIDRS "$(printf '%s' "$CONSOLE_ALLOW" | tr ' ' ',')"
    set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
    set_env BACKUP_KEY "$(openssl rand -hex 32)"
    set_env BACKUP_PATH "$APP_DIR/opex-backups"
    set_env AUDIT_ARCHIVE_PATH "$APP_DIR/audit-archive"
    mkdir -p "$APP_DIR/opex-backups" "$APP_DIR/audit-archive" "$APP_DIR/db-dumps"
    log "Building the OPEX API image to generate keys"
    compose build -q opex-api
    compose run --rm --no-deps opex-api node --no-warnings src/cli.ts keys:generate | while IFS= read -r line; do
      [ -n "$line" ] || continue
      k="${line%%=*}"; v="${line#*=}"
      set_env "$k" "$v"
    done
    [ -n "$(get_env SESSION_SECRET)" ] || die "Key generation failed (infra/.env has no SESSION_SECRET)"
    warn "Secrets are in $envf. Copy BACKUP_KEY and INQUIRY_KEY to your password manager: without them backups and inquiries cannot be decrypted."
  else
    # Update: a database dump before anything changes.
    if compose ps -q postgres >/dev/null 2>&1 && [ -n "$(compose ps -q postgres)" ]; then
      local dump="$APP_DIR/db-dumps/pre-update-$(date -u +%Y%m%dT%H%M%SZ).dump"
      mkdir -p "$APP_DIR/db-dumps"
      log "Database dump before the update → $dump"
      (umask 077; compose exec -T postgres pg_dump -U opex -d opex -Fc > "$dump") || warn "Dump failed; continuing (console backups still exist)"
      ls -1t "$APP_DIR"/db-dumps/pre-update-*.dump 2>/dev/null | tail -n +6 | xargs -r rm -f
    fi
  fi

  log "Building and starting the stack ($REF, $SHA) — the first build takes several minutes"
  if ! compose up -d --build --remove-orphans; then
    if [ -n "$PREV_REF" ]; then
      warn "The new version did not build or start — going back to the previous one"
      git -C "$APP_DIR" checkout -q "$PREV_REF"; compose up -d --build --remove-orphans || true
    fi
    die "docker compose up failed. Logs: arapoush logs"
  fi
  # The API runs as a non-root user: give it the backup and archive folders.
  compose run --rm --no-deps --user root --entrypoint sh opex-api -c 'chown -R opex /backups /archive' >/dev/null 2>&1 || true

  log "Waiting for the site to answer"
  local code=000 site_domain; site_domain="$(get_env SITE_DOMAIN)"
  for _ in $(seq 1 90); do
    code="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "$site_domain:443:127.0.0.1" "https://$site_domain/fa" || true)"
    [ "$code" = 200 ] && break; sleep 2
  done
  [ "$code" = 200 ] || warn "The site did not answer yet (HTTP $code). DNS and certificates may still be pending: arapoush status"
  compose exec -T opex-api node --no-warnings src/cli.ts site:revalidate >/dev/null 2>&1 || true

  # First super admin (first install only).
  if [ -z "$PREV_REF" ]; then
    ADMIN_EMAIL="${ADMIN_EMAIL:-$(ask "Email of the first console admin" "admin@$DOMAIN")}"
    local pass; pass="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
    if compose exec -T -e OPEX_NEW_PASSWORD="$pass" opex-api node --no-warnings src/cli.ts create-operator "$ADMIN_EMAIL" "Admin" super_admin >/dev/null 2>&1; then
      ADMIN_NOTE="Console admin: $ADMIN_EMAIL / temporary password: $pass (change it after the first sign-in; the authenticator is set up then)"
    else
      ADMIN_NOTE="Create the console admin with: sudo arapoush admin"
    fi
  fi

  if [ "$INIT" = systemd ] && [ "$AUTO_UPDATE" = 1 ]; then warn "AUTO_UPDATE is for the website-only mode; full-platform updates stay manual (sudo arapoush update)."; fi
  for key in $SAVED_KEYS; do printf '%s=%s\n' "$key" "${!key:-}"; done > "$CONF"; chmod 600 "$CONF"
  write_helper
  trap - ERR
  echo
  ok "Arapoush platform is up ($REF, $SHA)"
  echo "   Site:    https://$(get_env SITE_DOMAIN)/fa"
  echo "   Console: https://$(get_env CONSOLE_DOMAIN)   (only from: $(get_env CONSOLE_ALLOW))"
  [ -z "${ADMIN_NOTE:-}" ] || echo "   $ADMIN_NOTE"
  echo "   DNS: point $(get_env SITE_DOMAIN), $(get_env OPEX_DOMAIN) and $(get_env CONSOLE_DOMAIN) at this server."
  echo "   Menu: sudo arapoush   (update, status, logs, backup, rollback …)"
  exit 0
}

if [ "$MODE" = full ]; then full_install; fi

# ── Node.js (official build, checksum-verified; Alpine uses its own package) ──
node_ok() { have "$1" && "$1" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)'; }

NODE_BIN=""
if node_ok "$NODE_HOME/bin/node"; then NODE_BIN="$NODE_HOME/bin/node"
elif node_ok node; then NODE_BIN="$(command -v node)"
fi

if [ -z "$NODE_BIN" ]; then
  if [ -f /etc/alpine-release ] || (ldd --version 2>&1 | grep -qi musl); then
    log "Installing Node.js from the Alpine repositories"
    apk add --no-cache nodejs npm >/dev/null
    node_ok node || die "Alpine's Node.js is older than 20.9; use Alpine 3.19 or newer."
    NODE_BIN="$(command -v node)"
  else
    case "$(uname -m)" in
      x86_64|amd64) arch=x64 ;;
      aarch64|arm64) arch=arm64 ;;
      armv7l) arch=armv7l ;;
      ppc64le) arch=ppc64le ;;
      s390x) arch=s390x ;;
      *) die "Unsupported CPU architecture: $(uname -m)" ;;
    esac
    log "Installing Node.js ${NODE_MAJOR}.x LTS ($arch)"
    sums="$(curl -fsSL "$NODE_MIRROR/latest-v${NODE_MAJOR}.x/SHASUMS256.txt")"
    line="$(printf '%s\n' "$sums" | grep "linux-${arch}.tar.xz\$" | head -n1)"
    [ -n "$line" ] || die "No Node.js ${NODE_MAJOR}.x build for linux-$arch on $NODE_MIRROR"
    sum="${line%% *}"; file="${line##* }"
    tmp="$(mktemp -d)"
    curl -fsSL "$NODE_MIRROR/latest-v${NODE_MAJOR}.x/$file" -o "$tmp/$file"
    echo "$sum  $tmp/$file" | sha256sum -c - >/dev/null || die "Node.js checksum mismatch"
    rm -rf "$NODE_HOME" && mkdir -p "$NODE_HOME"
    tar -xJf "$tmp/$file" -C "$NODE_HOME" --strip-components=1
    rm -rf "$tmp"
    NODE_BIN="$NODE_HOME/bin/node"
  fi
fi
NODE_DIR="$(dirname "$NODE_BIN")"
export PATH="$NODE_DIR:$PATH"
ok "Node.js $("$NODE_BIN" -v)"

# ── Swap for small servers (next build needs ~1.5 GB) ───────────────────────
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
swap_mb=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "${NO_SWAP:-0}" != "1" ] && [ "$mem_mb" -lt 2000 ] && [ "$swap_mb" -lt 1000 ] && [ ! -e /swapfile-arapoush ]; then
  log "Low memory (${mem_mb} MB): adding a 2 GB swap file for the build"
  if (fallocate -l 2G /swapfile-arapoush 2>/dev/null || dd if=/dev/zero of=/swapfile-arapoush bs=1M count=2048 status=none) \
     && chmod 600 /swapfile-arapoush && mkswap /swapfile-arapoush >/dev/null && swapon /swapfile-arapoush; then
    grep -q swapfile-arapoush /etc/fstab || echo '/swapfile-arapoush none swap sw 0 0' >> /etc/fstab
  else
    rm -f /swapfile-arapoush; warn "Could not add swap (container?). The build may run out of memory."
  fi
fi

# ── App user and source ─────────────────────────────────────────────────────
if ! id "$APP_USER" >/dev/null 2>&1; then
  if have useradd; then useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null || useradd -r -d "$APP_DIR" -s /sbin/nologin "$APP_USER"
  else adduser -S -D -H -h "$APP_DIR" "$APP_USER"; fi
fi

# Each version is built in its own folder under releases/ while the old one keeps serving;
# "current" switches only after a successful build, and switches back if the new one won't start.
RELEASES="$APP_DIR/releases"
CURRENT="$APP_DIR/current"
mkdir -p "$RELEASES"

# Every release has a "run" link to the folder holding server.js; the service always starts
# "$CURRENT/run/server.js". Single-app releases (v1.0.x) keep it in .next/standalone, monorepo
# releases in apps/web/.next/standalone/apps/web. Older releases get the link added here.
link_run() {
  local r="$1"
  if [ -e "$r/run" ]; then return 0
  elif [ -f "$r/.next/standalone/server.js" ]; then ln -sfn .next/standalone "$r/run"
  elif [ -f "$r/apps/web/.next/standalone/apps/web/server.js" ]; then ln -sfn apps/web/.next/standalone/apps/web "$r/run"
  fi
}
for r in "$RELEASES"/*/; do if [ -d "$r" ]; then link_run "${r%/}"; fi; done

if [ "$VERSION" = latest ]; then
  # numeric sort of vX.Y.Z (BusyBox has no sort -V)
  REF="$(git ls-remote --tags --refs "$REPO_URL" 'v*' | awk -F/ '{print $NF}' | sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n1)"
  [ -n "$REF" ] || REF="$BRANCH"
else
  REF="$VERSION"
fi
SHA="$(git ls-remote "$REPO_URL" "refs/tags/$REF" "refs/heads/$REF" | awk 'NR==1 {print substr($1,1,7)}')"
[ -n "$SHA" ] || die "No release or branch called '$REF' in $REPO_URL"
RELEASE="$RELEASES/$REF-$SHA"
PREVIOUS=""
[ ! -L "$CURRENT" ] || PREVIOUS="$(readlink -f "$CURRENT")"

if [ "$PREVIOUS" = "$RELEASE" ] && [ "${FORCE:-0}" != "1" ] && [ -f "$RELEASE/run/server.js" ]; then
  ok "Already running $REF ($SHA) — refreshing the configuration only (FORCE=1 rebuilds)"
  BUILD=0
else
  log "Fetching $REF ($SHA)"
  rm -rf "$RELEASE"
  git clone --depth 1 --branch "$REF" -q "$REPO_URL" "$RELEASE"
  BUILD=1
fi
git config --global --add safe.directory "$RELEASE" 2>/dev/null || true

# ── Ports and canonical URL ────────────────────────────────────────────────
port_busy() { (have ss && ss -ltnH "sport = :$1" | grep -q .) || (have netstat && netstat -ltn 2>/dev/null | grep -q "[:.]$1 "); }
own_port() { [ "$INIT" = systemd ] && systemctl is-active -q "$SERVICE" && systemctl show -p Environment "$SERVICE" | grep -q "PORT=$1"; }

if [ -n "$DOMAIN" ]; then
  BIND_HOST=127.0.0.1; BIND_PORT="$APP_PORT"
  [ -n "$SITE_URL" ] || SITE_URL="https://$DOMAIN"
else
  BIND_HOST=0.0.0.0; BIND_PORT="$PORT"
  if port_busy "$BIND_PORT" && ! own_port "$BIND_PORT"; then
    warn "Port $BIND_PORT is in use (another web server?). Using $APP_PORT instead."
    BIND_PORT="$APP_PORT"
  fi
  if [ -z "$SITE_URL" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"; [ -n "$ip" ] || ip="localhost"
    SITE_URL="http://$ip"; [ "$BIND_PORT" = 80 ] || SITE_URL="$SITE_URL:$BIND_PORT"
  fi
fi

# ── Build ──────────────────────────────────────────────────────────────────
if [ "$BUILD" = 1 ]; then
trap 'rm -rf "$RELEASE"; die "Build of $REF failed at line $LINENO — the running site was not touched"' ERR
log "Installing dependencies"
cd "$RELEASE"
export NEXT_TELEMETRY_DISABLED=1 npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
[ -z "$NPM_REGISTRY" ] || export npm_config_registry="$NPM_REGISTRY"
if [ -f pnpm-workspace.yaml ]; then
  # Monorepo (v1.1+): the site is apps/web; pnpm at the exact version the repo pins.
  PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' package.json)"
  [ -n "$PNPM_VERSION" ] || die "package.json does not pin a pnpm version (packageManager)"
  pnpm_run() { "$NODE_DIR/npx" --yes "pnpm@$PNPM_VERSION" "$@"; }
  pnpm_run install --frozen-lockfile --reporter=silent --filter "@arapoush/web..."
  log "Building the site (SITE_URL=$SITE_URL) — this takes a few minutes"
  NEXT_PUBLIC_SITE_URL="$SITE_URL" NODE_OPTIONS="--max-old-space-size=1536" pnpm_run --filter @arapoush/web build --reporter=silent
  APP_SRC=apps/web
  SERVER_DIR=apps/web/.next/standalone/apps/web
else
  # Single-app layout (v1.0.x).
  "$NODE_DIR/npm" ci --no-audit --no-fund --loglevel=error
  log "Building the site (SITE_URL=$SITE_URL) — this takes a few minutes"
  NEXT_PUBLIC_SITE_URL="$SITE_URL" NODE_OPTIONS="--max-old-space-size=1536" "$NODE_DIR/npm" run build --silent
  APP_SRC=.
  SERVER_DIR=.next/standalone
fi
[ -f "$SERVER_DIR/server.js" ] || die "The build did not produce $SERVER_DIR/server.js"

# The standalone server needs its static assets beside it.
cp -r "$APP_SRC/public" "$SERVER_DIR/"
mkdir -p "$SERVER_DIR/.next" && rm -rf "$SERVER_DIR/.next/static" && cp -r "$APP_SRC/.next/static" "$SERVER_DIR/.next/"
# The standalone server carries its own dependencies: drop the build-time ones.
rm -rf node_modules apps/*/node_modules packages/*/node_modules "$APP_SRC/.next/cache"
ln -sfn "$SERVER_DIR" "$RELEASE/run"
printf 'version=%s\ncommit=%s\nbuilt=%s\n' "$REF" "$SHA" "$(date -u +%FT%TZ)" > "$RELEASE/.arapoush-release"
trap 'die "Failed at line $LINENO: $BASH_COMMAND"' ERR
fi
chown -R "$APP_USER" "$RELEASE"
ln -sfn "$RELEASE" "$CURRENT"

# ── Service ────────────────────────────────────────────────────────────────
restart_app() {
  if [ "$INIT" = systemd ]; then systemctl restart "$SERVICE"
  elif [ "$INIT" = openrc ]; then rc-service "$SERVICE" restart >/dev/null
  else
    pkill -f "$CURRENT/run/server.js" 2>/dev/null || true
    (cd "$CURRENT/run" && NODE_ENV=production HOSTNAME=$BIND_HOST PORT=$BIND_PORT nohup "$NODE_BIN" "$CURRENT/run/server.js" >"/var/log/$SERVICE.log" 2>&1 &)
  fi
}

log "Starting the service ($BIND_HOST:$BIND_PORT)"
if [ "$INIT" = systemd ]; then
  cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Arapoush website (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$CURRENT/run
Environment=NODE_ENV=production HOSTNAME=$BIND_HOST PORT=$BIND_PORT NEXT_TELEMETRY_DISABLED=1
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=3
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE" -q
  systemctl restart "$SERVICE"
elif [ "$INIT" = openrc ]; then
  cat > "/etc/init.d/$SERVICE" <<EOF
#!/sbin/openrc-run
description="Arapoush website (Next.js)"
command="$NODE_BIN"
command_args="server.js"
command_user="$APP_USER"
directory="$CURRENT/run"
command_background=true
pidfile="/run/$SERVICE.pid"
output_log="/var/log/$SERVICE.log"
error_log="/var/log/$SERVICE.log"
export NODE_ENV=production HOSTNAME=$BIND_HOST PORT=$BIND_PORT NEXT_TELEMETRY_DISABLED=1
depend() { need net; }
EOF
  chmod +x "/etc/init.d/$SERVICE"
  touch "/var/log/$SERVICE.log" && chown "$APP_USER" "/var/log/$SERVICE.log"
  [ "$BIND_PORT" -ge 1024 ] || warn "OpenRC: binding port $BIND_PORT as '$APP_USER' may need setcap on $NODE_BIN."
  have setcap && setcap 'cap_net_bind_service=+ep' "$NODE_BIN" 2>/dev/null || true
  rc-update add "$SERVICE" default >/dev/null 2>&1 || true
  rc-service "$SERVICE" restart >/dev/null
else
  warn "No systemd or OpenRC found: starting in the background (it won't survive a reboot)."
  pkill -f "$CURRENT/run/server.js" 2>/dev/null || true
  (cd "$CURRENT/run" && NODE_ENV=production HOSTNAME=$BIND_HOST PORT=$BIND_PORT nohup "$NODE_BIN" "$CURRENT/run/server.js" >/var/log/$SERVICE.log 2>&1 &)
fi

# ── HTTPS with Caddy (only when DOMAIN is set) ─────────────────────────────
if [ -n "$DOMAIN" ]; then
  if ! have caddy; then
    case "$(uname -m)" in x86_64|amd64) carch=amd64 ;; aarch64|arm64) carch=arm64 ;; armv7l) carch=arm\&arm=7 ;; *) die "No Caddy build for $(uname -m)" ;; esac
    log "Installing Caddy (automatic HTTPS)"
    curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=$carch" -o /usr/local/bin/caddy
    chmod +x /usr/local/bin/caddy
  fi
  CADDY_BIN="$(command -v caddy)"
  mkdir -p /etc/caddy /var/lib/caddy
  {
    echo "$DOMAIN {"
    echo "  encode zstd gzip"
    echo "  reverse_proxy 127.0.0.1:$APP_PORT"
    echo "}"
    if [ "$WWW" = "1" ]; then
      echo "www.$DOMAIN {"
      echo "  redir https://$DOMAIN{uri} permanent"
      echo "}"
    fi
  } > /etc/caddy/Caddyfile.arapoush
  "$CADDY_BIN" fmt --overwrite /etc/caddy/Caddyfile.arapoush >/dev/null 2>&1 || true
  if [ "$INIT" = systemd ]; then
    cat > /etc/systemd/system/caddy-arapoush.service <<EOF
[Unit]
Description=Caddy (HTTPS for the Arapoush website)
After=network-online.target $SERVICE.service
Wants=network-online.target

[Service]
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
ExecStart=$CADDY_BIN run --config /etc/caddy/Caddyfile.arapoush --adapter caddyfile
ExecReload=$CADDY_BIN reload --config /etc/caddy/Caddyfile.arapoush --adapter caddyfile
Restart=always
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable caddy-arapoush -q
    systemctl restart caddy-arapoush
  elif [ "$INIT" = openrc ]; then
    cat > /etc/init.d/caddy-arapoush <<EOF
#!/sbin/openrc-run
description="Caddy (HTTPS for the Arapoush website)"
command="$CADDY_BIN"
command_args="run --config /etc/caddy/Caddyfile.arapoush --adapter caddyfile"
command_background=true
pidfile="/run/caddy-arapoush.pid"
export XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy
depend() { need net; after $SERVICE; }
EOF
    chmod +x /etc/init.d/caddy-arapoush
    rc-update add caddy-arapoush default >/dev/null 2>&1 || true
    rc-service caddy-arapoush restart >/dev/null
  else
    (XDG_DATA_HOME=/var/lib/caddy nohup "$CADDY_BIN" run --config /etc/caddy/Caddyfile.arapoush --adapter caddyfile >/var/log/caddy-arapoush.log 2>&1 &)
  fi
fi

# ── Firewall ───────────────────────────────────────────────────────────────
open_ports=("$BIND_PORT"); [ -z "$DOMAIN" ] || open_ports=(80 443)
if have ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
  for p in "${open_ports[@]}"; do ufw allow "$p/tcp" >/dev/null; done
elif have firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then
  for p in "${open_ports[@]}"; do firewall-cmd --permanent --add-port="$p/tcp" >/dev/null; done
  firewall-cmd --reload >/dev/null
fi

# ── Health check ───────────────────────────────────────────────────────────
log "Waiting for the site to answer"
code=000
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$BIND_PORT/fa" || true)"
  [ "$code" = 200 ] && break
  sleep 1
done
if [ "$code" != 200 ]; then
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ] && [ -d "$PREVIOUS" ]; then
    warn "$REF did not start (HTTP $code) — rolling back to $(basename "$PREVIOUS")"
    ln -sfn "$PREVIOUS" "$CURRENT"
    restart_app
  fi
  die "The site did not start (HTTP $code). Logs: journalctl -u $SERVICE -n 50"
fi

# Keep the running release and the one before it; drop older builds and the old single-folder layout.
# (ls -t rather than find -printf, which BusyBox lacks)
ls -1dt "$RELEASES"/*/ | tail -n +3 | while read -r old; do [ "${old%/}" = "$RELEASE" ] || rm -rf "$old"; done
if [ -d "$APP_DIR/.git" ]; then
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name releases ! -name current -exec rm -rf {} +
fi

# ── Saved settings, helper command, nightly updates ────────────────────────
for key in $SAVED_KEYS; do printf '%s=%s\n' "$key" "${!key:-}"; done > "$CONF"
chmod 600 "$CONF"

write_helper

if [ "$INIT" = systemd ]; then
  if [ "$AUTO_UPDATE" = 1 ]; then
    cat > /etc/systemd/system/arapoush-update.service <<'UNIT'
[Unit]
Description=Install the newest Arapoush website release
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/arapoush update latest
UNIT
    cat > /etc/systemd/system/arapoush-update.timer <<'UNIT'
[Unit]
Description=Nightly Arapoush website update

[Timer]
OnCalendar=*-*-* 03:30
RandomizedDelaySec=30min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
    systemctl daemon-reload
    systemctl enable --now arapoush-update.timer -q
  else
    systemctl disable --now arapoush-update.timer -q 2>/dev/null || true
  fi
fi

trap - ERR
echo
ok "Arapoush is live: $SITE_URL"
echo "   Persian: $SITE_URL/fa   English: $SITE_URL/en   Turkish: $SITE_URL/tr"
[ -z "$DOMAIN" ] || echo "   HTTPS certificate is issued automatically once $DOMAIN points to this server."
echo "   Version: $REF ($SHA)"
echo "   Menu:    sudo arapoush   (update, check, rollback, restart, logs …)"
[ "$AUTO_UPDATE" != 1 ] || echo "   New releases install automatically every night (AUTO_UPDATE=1)."
if [ "$INIT" = systemd ]; then echo "   Logs:    journalctl -u $SERVICE -f"; fi
