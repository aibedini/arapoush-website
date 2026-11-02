#!/usr/bin/env bash
# Arapoush website — one-line installer for any Linux server (VPS, dedicated, VM).
#
#   curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo bash
#
# With a domain (automatic HTTPS through Caddy):
#   curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo DOMAIN=arapoush.com bash
#
# Update to the newest release (keeps DOMAIN, PORT, … from the first install):
#   sudo arapoush update            # or: sudo arapoush update v1.2.0 / sudo arapoush update main
#
# Options (environment variables; saved in /etc/arapoush.conf and reused by updates):
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
SAVED_KEYS="DOMAIN WWW PORT APP_PORT SITE_URL BRANCH APP_DIR NODE_MIRROR NPM_REGISTRY AUTO_UPDATE"
if [ -f "$CONF" ] && [ "${UNINSTALL:-0}" != "1" ]; then
  while IFS='=' read -r key value; do
    case " $SAVED_KEYS " in *" $key "*) [ -n "${!key:-}" ] || printf -v "$key" '%s' "$value" ;; esac
  done < "$CONF"
fi

REPO_URL="${REPO_URL:-https://github.com/aibedini/arapoush-website.git}"
BRANCH="${BRANCH:-main}"
VERSION="${VERSION:-latest}"
AUTO_UPDATE="${AUTO_UPDATE:-0}"
APP_DIR="${APP_DIR:-/opt/arapoush}"
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

if [ "$PREVIOUS" = "$RELEASE" ] && [ "${FORCE:-0}" != "1" ] && [ -f "$RELEASE/.next/standalone/server.js" ]; then
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
"$NODE_DIR/npm" ci --no-audit --no-fund --loglevel=error

log "Building the site (SITE_URL=$SITE_URL) — this takes a few minutes"
NEXT_PUBLIC_SITE_URL="$SITE_URL" NODE_OPTIONS="--max-old-space-size=1536" "$NODE_DIR/npm" run build --silent

# The standalone server needs its static assets beside it.
cp -r public .next/standalone/
mkdir -p .next/standalone/.next && rm -rf .next/standalone/.next/static && cp -r .next/static .next/standalone/.next/
rm -rf node_modules .next/cache   # the standalone server carries its own dependencies
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
    pkill -f "$CURRENT/.next/standalone/server.js" 2>/dev/null || true
    (cd "$CURRENT/.next/standalone" && NODE_ENV=production HOSTNAME=$BIND_HOST PORT=$BIND_PORT nohup "$NODE_BIN" server.js >"/var/log/$SERVICE.log" 2>&1 &)
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
WorkingDirectory=$CURRENT/.next/standalone
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
directory="$CURRENT/.next/standalone"
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
  pkill -f "$CURRENT/.next/standalone/server.js" 2>/dev/null || true
  (cd "$CURRENT/.next/standalone" && NODE_ENV=production HOSTNAME=$BIND_HOST PORT=$BIND_PORT nohup "$NODE_BIN" "$CURRENT/.next/standalone/server.js" >/var/log/$SERVICE.log 2>&1 &)
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

cat > /usr/local/bin/arapoush <<'HELPER'
#!/usr/bin/env bash
# Arapoush website helper, written by install.sh.
set -euo pipefail
REPO="https://github.com/aibedini/arapoush-website.git"
INSTALLER="https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh"
APP_DIR="$(sed -n 's/^APP_DIR=//p' /etc/arapoush.conf 2>/dev/null || true)"
APP_DIR="${APP_DIR:-/opt/arapoush}"
as_root() { [ "$(id -u)" -eq 0 ] || exec sudo "$0" "$@"; }
restart() { if command -v systemctl >/dev/null && [ -d /run/systemd/system ]; then systemctl restart arapoush; else rc-service arapoush restart; fi; }
current() { sed -n 's/^version=//p' "$APP_DIR/current/.arapoush-release" 2>/dev/null; }
case "${1:-help}" in
  update)
    as_root "$@"
    curl -fsSL "$INSTALLER" | VERSION="${2:-latest}" bash ;;
  check)
    latest="$(git ls-remote --tags --refs "$REPO" 'v*' | awk -F/ '{print $NF}' | sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n1)"
    if [ -n "$latest" ] && [ "$latest" != "$(current)" ]; then echo "Update available: $(current) → $latest   (sudo arapoush update)"
    else echo "Up to date: $(current)"; fi ;;
  version)  cat "$APP_DIR/current/.arapoush-release" ;;
  releases) ls -1t "$APP_DIR/releases" ;;
  rollback)
    as_root "$@"
    now="$(readlink -f "$APP_DIR/current")"
    prev="$(ls -1dt "$APP_DIR"/releases/*/ | sed 's#/$##' | grep -vxF "$now" | head -n1 || true)"
    [ -n "$prev" ] || { echo "No previous release to go back to."; exit 1; }
    ln -sfn "$prev" "$APP_DIR/current" && restart
    echo "Rolled back to $(basename "$prev")" ;;
  restart)  as_root "$@"; restart ;;
  logs)     if command -v journalctl >/dev/null; then journalctl -u arapoush -f; else tail -f /var/log/arapoush.log; fi ;;
  uninstall) as_root "$@"; curl -fsSL "$INSTALLER" | UNINSTALL=1 bash ;;
  *) echo "Usage: arapoush update [latest|vX.Y.Z|branch] | check | version | releases | rollback | restart | logs | uninstall" ;;
esac
HELPER
chmod 755 /usr/local/bin/arapoush

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
echo "   Update:  sudo arapoush update    ·  check: arapoush check  ·  undo: sudo arapoush rollback"
[ "$AUTO_UPDATE" != 1 ] || echo "   New releases install automatically every night (AUTO_UPDATE=1)."
if [ "$INIT" = systemd ]; then echo "   Logs:    journalctl -u $SERVICE -f"; fi
