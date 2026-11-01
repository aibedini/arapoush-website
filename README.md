# Arapoush Gostar — website

Marketing site for **Arapoush Gostar (آراپوش گستر)**, maker of multi-layer plastic tubes and effervescent
tablet tubes. Persian (default, RTL), English and Turkish. Next.js 15, GSAP and animate-ui.

## Install on a Linux server — one line

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo bash
```

With your domain and automatic HTTPS (point the domain's DNS `A` record to the server first):

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo DOMAIN=arapoush.com bash
```

Run the same command again to **update** to the latest version.

The installer works on Ubuntu, Debian, Rocky, AlmaLinux, CentOS Stream, Fedora, openSUSE, Arch and Alpine,
on x86-64 and ARM servers. It:

1. installs git and Node.js 22 LTS (official build, checksum-verified) if they are missing,
2. adds a swap file on servers with less than 2 GB RAM so the build doesn't run out of memory,
3. clones this repo to `/opt/arapoush`, builds the site and runs it as a service (systemd or OpenRC) that restarts on reboot or crash,
4. with `DOMAIN`, puts [Caddy](https://caddyserver.com) in front for a free, auto-renewing HTTPS certificate,
5. opens the needed ports in ufw/firewalld and checks the site is answering.

| Option | Default | Meaning |
|---|---|---|
| `DOMAIN` | – | Serve on 80/443 with HTTPS for this domain |
| `WWW=1` | off | Also answer on `www.DOMAIN` and redirect it |
| `PORT` | `80` | Public port when no `DOMAIN` is set |
| `SITE_URL` | `https://DOMAIN` or `http://SERVER-IP` | Canonical URL used for SEO tags, sitemap and structured data |
| `BRANCH` | `main` | Git branch to deploy |
| `APP_DIR` | `/opt/arapoush` | Install location |
| `NODE_MIRROR` | `https://nodejs.org/dist` | Node.js download mirror |
| `NPM_REGISTRY` | npmjs.org | npm registry mirror, for servers with slow access to npm |
| `NO_SWAP=1` | off | Don't add a swap file |
| `UNINSTALL=1` | off | Remove the service, Caddy config and `/opt/arapoush` |

Example with options: `curl -fsSL …/install.sh | sudo DOMAIN=arapoush.com WWW=1 bash`

Logs: `journalctl -u arapoush -f` · Restart: `systemctl restart arapoush`

### With Docker instead

```bash
git clone https://github.com/aibedini/arapoush-website.git && cd arapoush-website
SITE_URL=https://arapoush.com docker compose up -d --build
```

---

## نصب روی سرور لینوکس با یک دستور

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo bash
```

با دامنه و HTTPS خودکار (اول رکورد `A` دامنه را به IP سرور وصل کنید):

```bash
curl -fsSL https://raw.githubusercontent.com/aibedini/arapoush-website/main/install.sh | sudo DOMAIN=arapoush.com bash
```

برای **به‌روزرسانی** همان دستور را دوباره اجرا کنید. اگر سرور به npm یا nodejs.org دسترسی کندی دارد،
با `NPM_REGISTRY` و `NODE_MIRROR` یک میرور بدهید.

---

## Development

```bash
npm install
npm run dev          # http://localhost:3000 → /fa
npm run build && npm start
```

- Section order of the home page: `content/home-layout.json` (backend drag-and-drop writes this list).
- Text for every language: `lib/i18n/dictionaries/`.
- Contact details, social links, catalog PDF path: `lib/site.ts`. Put the catalog at `public/files/arapoush-catalog.pdf`.
- SEO and AI indexing: `lib/seo.ts`, `app/sitemap.ts`, `app/robots.ts`, `/llms.txt`, `/llms-full.txt`.
- Quality bar (Lighthouse, accessibility, motion and RTL rules): see `CLAUDE.md`.

Fonts: Helvetica Neue (licensed, supplied by Arapoush), Vazirmatn, Inter and JetBrains Mono (SIL OFL).
