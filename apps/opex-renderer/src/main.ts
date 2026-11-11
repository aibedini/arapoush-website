/**
 * OPEX 3D renderer (plan P10): the server-side port of apps/web/scripts/render-effervescent.cjs.
 *
 *   OPEX_URL=http://opex-api:4000 RENDER_TOKEN=… RENDER_SITE_URL=http://web:3000 CHROME_PATH=… node src/main.ts
 *
 * Loop: claim a job → open the effervescent page with `?webgl&render` (the page exposes its scene) →
 * render every size at one shared scale, each cap variant, the uses image and the four hero posters
 * → upload each PNG (OPEX re-encodes it to WebP) → report the images and dimension marks. Any error
 * is reported; OPEX retries a job three times.
 */
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const OPEX = (process.env.OPEX_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const TOKEN = process.env.RENDER_TOKEN ?? "";
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/chromium-browser";
const POLL_MS = Number(process.env.POLL_MS ?? 15_000);
const once = process.argv.includes("--once");
if (TOKEN.length < 24) throw new Error("RENDER_TOKEN is required");

type Size = { id: string; d: number; h: number };
type Job = { id: string; input: { sizes: Size[]; caps: string[]; defaultSize: string; renderPxPerMm: number }; site: string };
type Shot = { url: string; width: number; height: number; base?: number; mouth?: number; left?: number; right?: number };
type Uploaded = { asset: string; width: number; height: number };

// The page's scene API (EffScene), as the original script uses it.
type Scene = {
  setSize(d: number, h: number): void;
  setVariant(id: string): void;
  productShot(pxPerMm: number, exploded?: boolean): Shot;
  snapshot(): string;
  setProgress(p: number, jump?: boolean): void;
  render(t: number, dt: number): void;
  settle(dt: number): void;
  glassMoment(t: number): void;
  copyWall: boolean;
  yaw: number;
  velocity: number;
};
declare global {
  interface Window {
    __effScene?: Scene;
  }
}

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const r = await fetch(`${OPEX}${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, ...(init.body && !(init.body instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  const text = await r.text();
  if (r.status >= 400) throw new Error(`${path}: ${r.status} ${text.slice(0, 300)}`);
  return { status: r.status, body: (text ? JSON.parse(text) : null) as T };
}

const png = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1]!, "base64");

async function ready(page: Page, url: string, viewport: { width: number; height: number }) {
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  await page.mouse.move(10, 10);
  await page.keyboard.press("Shift");
  await page.waitForFunction(() => window.__effScene, { timeout: 120_000 });
  await wait(2500); // logo texture
}

async function render(browser: Browser, job: Job) {
  const site = (process.env.RENDER_SITE_URL ?? job.site).replace(/\/$/, "");
  const { input } = job;
  const page = await browser.newPage();
  page.on("pageerror", (e) => log("pageerror", { error: String(e) }));
  const upload = async (name: string, dataUrl: string): Promise<Uploaded> =>
    (await api<Uploaded>(`/v1/render/jobs/${job.id}/assets`, { method: "POST", body: new Uint8Array(png(dataUrl)), headers: { "content-type": "application/octet-stream", "x-filename": name } })).body;

  try {
    await ready(page, `${site}/en/products/effervescent-tube?webgl&render`, { width: 1600, height: 1000 });
    const sizes = [];
    for (const s of input.sizes) {
      const shot = await page.evaluate((d, h, k) => {
        const sc = window.__effScene!;
        sc.setSize(d, h);
        return sc.productShot(k);
      }, s.d, s.h, input.renderPxPerMm);
      const up = await upload(`size-${s.id}.png`, shot.url);
      sizes.push({ id: s.id, asset: up.asset, width: up.width, height: up.height, base: shot.base!, mouth: shot.mouth!, left: shot.left!, right: shot.right! });
      log("size", { job: job.id, id: s.id, width: up.width, height: up.height });
    }

    // Exploded caps, on the hero size.
    const hero = input.sizes.find((s) => s.id === input.defaultSize)!;
    const caps = [];
    for (const id of input.caps) {
      const shot = await page.evaluate((d, h, v) => {
        const sc = window.__effScene!;
        sc.setSize(d, h);
        sc.setVariant(v);
        return sc.productShot(8, true);
      }, hero.d, hero.h, id);
      const up = await upload(`cap-${id}.png`, shot.url);
      caps.push({ id, asset: up.asset, width: up.width, height: up.height });
      log("cap", { job: job.id, id });
    }
    if (input.caps.includes("spiral")) await page.evaluate(() => window.__effScene!.setVariant("spiral"));

    // Applications image: the story's last pose, tablets settled on the floor.
    const usesUrl = await page.evaluate((d, h) => {
      const sc = window.__effScene!;
      sc.setSize(d, h);
      sc.copyWall = false;
      sc.yaw = -0.6;
      sc.setProgress(0.75, true);
      for (let i = 0; i < 80; i++) {
        sc.render(performance.now() + i * 16, 1 / 60);
        sc.settle(1 / 60);
      }
      sc.settle(3);
      sc.setProgress(0.8, true);
      return sc.snapshot();
    }, hero.d, hero.h);
    const usesUp = await upload("uses-tablets.png", usesUrl);
    const uses = { asset: usesUp.asset, width: usesUp.width, height: usesUp.height };

    // Hero posters: wide and tall, for each reading direction.
    const posters: Record<string, Uploaded> = {};
    for (const [dir, lang] of [["ltr", "en"], ["rtl", "fa"]] as const) {
      for (const [kind, vp] of [["wide", { width: 1600, height: 1000 }], ["tall", { width: 780, height: 1688 }]] as const) {
        await ready(page, `${site}/${lang}/products/effervescent-tube?webgl&render`, vp);
        const url = await page.evaluate((d, h) => {
          const sc = window.__effScene!;
          sc.setSize(d, h);
          sc.yaw = -0.35;
          sc.velocity = 0;
          sc.setProgress(0, true);
          // The glass waits with clear water: the live scene drops the tablet in from here.
          sc.glassMoment(0);
          return sc.snapshot();
        }, hero.d, hero.h);
        const up = await upload(`hero-tube-${kind}-${dir}.png`, url);
        posters[`${kind}-${dir}`] = { asset: up.asset, width: up.width, height: up.height };
        log("poster", { job: job.id, kind, dir });
      }
    }
    const done = await api<{ number: number }>(`/v1/render/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify({ sizes, caps, uses, posters }) });
    log("done", { job: job.id, revision: done.body.number });
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    // Software WebGL: the server has no GPU. Sandboxing stays on unless the container forbids it.
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage", ...(process.env.CHROME_NO_SANDBOX ? ["--no-sandbox"] : [])],
  });
  log("renderer ready", { opex: OPEX, chrome: CHROME });
  let stop = false;
  for (const s of ["SIGTERM", "SIGINT"] as const) process.on(s, () => (stop = true));
  while (!stop) {
    let job: Job | null = null;
    try {
      const r = await api<Job>("/v1/render/claim", { method: "POST" });
      job = r.status === 204 ? null : r.body;
      if (job) {
        log("claimed", { job: job.id, sizes: job.input.sizes.length });
        await render(browser, job);
      }
    } catch (e) {
      log("error", { job: job?.id, error: String(e).slice(0, 500) });
      if (job) await api(`/v1/render/jobs/${job.id}/fail`, { method: "POST", body: JSON.stringify({ error: String(e).slice(0, 1900) }) }).catch(() => {});
    }
    if (once) break;
    if (!job) await wait(POLL_MS);
  }
  await browser.close();
}

await main();
