#!/usr/bin/env bash
# Arapoush website — one-line installer for any Linux server (VPS, dedicated, VM).
#
#   curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo bash
#
# With a domain (automatic HTTPS through Caddy):
#   curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo DOMAIN=arapoush.com bash
#
# Run the same command again to update to the latest commit. Options (environment variables):
#   DOMAIN=example.com     serve on 80/443 with a free Let's Encrypt certificate (DNS must point here)
#   WWW=1                  also answer on www.DOMAIN and redirect it to DOMAIN
#   PORT=80                public port when no DOMAIN is set (default 80)
#   SITE_URL=https://...   canonical URL for SEO (default https://DOMAIN, or http://SERVER-IP)
#   BRANCH=main            git branch to deploy
#   APP_DIR=/opt/arapoush  install location
#   NODE_MIRROR=...        Node.js download mirror (default https://nodejs.org/dist)
#   NPM_REGISTRY=...       npm registry mirror (e.g. for servers with slow access to npmjs.org)
#   NO_SWAP=1              don't add a swap file on small servers
#   UNINSTALL=1            remove the service, Caddy config and APP_DIR
set -Eeuo pipefail

REPO_URL="${REPO_URL:-https://github.com/aibedini/arapoush-website.git}"
BRANCH="${BRANCH:-main}"
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
    systemctl disable --now "$SERVICE" caddy-arapoush 2>/dev/null || true
    rm -f "/etc/systemd/system/$SERVICE.service" /etc/systemd/system/caddy-arapoush.service
    systemctl daemon-reload
  elif [ "$INIT" = openrc ]; then
    rc-service "$SERVICE" stop 2>/dev/null || true; rc-update del "$SERVICE" 2>/dev/null || true
    rc-service caddy-arapoush stop 2>/dev/null || true; rc-update del caddy-arapoush 2>/dev/null || true
    rm -f "/etc/init.d/$SERVICE" /etc/init.d/caddy-arapoush
  fi
  rm -rf "$APP_DIR" /etc/caddy/Caddyfile.arapoush "$NODE_HOME"
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

if [ -d "$APP_DIR/.git" ]; then
  log "Updating $APP_DIR ($BRANCH)"
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH" -q
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" -q
else
  log "Cloning $REPO_URL → $APP_DIR"
  rm -rf "$APP_DIR"
  git clone --depth 1 --branch "$BRANCH" -q "$REPO_URL" "$APP_DIR"
fi
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

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
log "Installing dependencies"
cd "$APP_DIR"
export NEXT_TELEMETRY_DISABLED=1 npm_config_fund=false npm_config_audit=false npm_config_update_notifier=false
[ -z "$NPM_REGISTRY" ] || export npm_config_registry="$NPM_REGISTRY"
"$NODE_DIR/npm" ci --no-audit --no-fund --loglevel=error

log "Building the site (SITE_URL=$SITE_URL) — this takes a few minutes"
NEXT_PUBLIC_SITE_URL="$SITE_URL" NODE_OPTIONS="--max-old-space-size=1536" "$NODE_DIR/npm" run build --silent

# The standalone server needs its static assets beside it.
cp -r public .next/standalone/
mkdir -p .next/standalone/.next && rm -rf .next/standalone/.next/static && cp -r .next/static .next/standalone/.next/
chown -R "$APP_USER" "$APP_DIR"

# ── Service ────────────────────────────────────────────────────────────────
log "Starting the service ($BIND_HOST:$BIND_PORT)"
if [ "$INIT" = systemd ]; then
  cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Arapoush website (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/.next/standalone
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
directory="$APP_DIR/.next/standalone"
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
  pkill -f "$APP_DIR/.next/standalone/server.js" 2>/dev/null || true
  (cd "$APP_DIR/.next/standalone" && NODE_ENV=production HOSTNAME=$BIND_HOST PORT=$BIND_PORT nohup "$NODE_BIN" "$APP_DIR/.next/standalone/server.js" >/var/log/$SERVICE.log 2>&1 &)
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
[ "$code" = 200 ] || die "The site did not start (HTTP $code). Logs: journalctl -u $SERVICE -n 50"

trap - ERR
echo
ok "Arapoush is live: $SITE_URL"
echo "   Persian: $SITE_URL/fa   English: $SITE_URL/en   Turkish: $SITE_URL/tr"
[ -z "$DOMAIN" ] || echo "   HTTPS certificate is issued automatically once $DOMAIN points to this server."
echo "   Update:  re-run the same install command"
if [ "$INIT" = systemd ]; then echo "   Logs:    journalctl -u $SERVICE -f"; fi
