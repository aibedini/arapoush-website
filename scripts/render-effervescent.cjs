/**
 * Renders the effervescent page's static images from the live 3D model (run against `npm run dev`):
 *   - size-<d>x<h>.webp   every standard size at one shared px-per-mm, so the line-up is to scale
 *   - hero-tube-{wide,tall}-{ltr,rtl}.webp   posters shown until (or instead of) WebGL
 *   - cap-{spiral,plain}.webp   exploded views of each cap
 *   - uses-tablets.webp   the tube lying with its tablets poured out
 * and writes the render sizes and dimension marks back into content/products/effervescent-tube.json.
 *
 *   node scripts/render-effervescent.cjs [http://localhost:3210] [path/to/chrome]
 *   ONLY=posters|uses node scripts/render-effervescent.cjs   (just the hero posters, or the uses image)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const puppeteer = require("puppeteer-core");

const base = process.argv[2] || "http://localhost:3210";
const chrome = process.argv[3] || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "content/products/effervescent-tube.json");
const out = path.join(root, "public/images/eff");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready(page, url, viewport) {
  await page.setViewport(viewport);
  await page.goto(base + url, { waitUntil: "load" });
  await page.mouse.move(10, 10);
  await page.keyboard.press("Shift");
  await page.waitForFunction(() => window.__effScene, { timeout: 60000 });
  await wait(2500); // logo texture
}

const png = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");

(async () => {
  const product = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("pageerror", e.message));

  const all = !process.env.ONLY;
  const uses = all || process.env.ONLY === "uses";
  const posters = all || process.env.ONLY === "posters";
  await ready(page, "/en/products/effervescent-tube?webgl", { width: 1600, height: 1000 });
  for (const s of all ? product.sizes : []) {
    const shot = await page.evaluate(
      (d, h, k) => {
        const sc = window.__effScene;
        sc.setSize(d, h);
        return sc.productShot(k);
      },
      s.d,
      s.h,
      product.renderPxPerMm,
    );
    await sharp(png(shot.url)).webp({ quality: 90, alphaQuality: 90 }).toFile(path.join(out, `size-${s.id}.webp`));
    s.render = { src: `/images/eff/size-${s.id}.webp`, width: shot.width, height: shot.height, base: shot.base, mouth: shot.mouth, left: shot.left, right: shot.right };
    console.log(s.id, shot.width, shot.height);
  }

  // Exploded caps, on the hero size.
  const hero0 = product.sizes.find((s) => s.id === product.defaultSize);
  for (const v of all || process.env.ONLY === "caps" ? product.caps.variants : []) {
    const shot = await page.evaluate(
      (d, h, id) => {
        const sc = window.__effScene;
        sc.setSize(d, h);
        sc.setVariant(id);
        return sc.productShot(8, true);
      },
      hero0.d,
      hero0.h,
      v.id,
    );
    await sharp(png(shot.url)).webp({ quality: 90, alphaQuality: 90 }).toFile(path.join(out, `cap-${v.id}.webp`));
    v.image = { src: `/images/eff/cap-${v.id}.webp`, width: shot.width, height: shot.height };
    console.log("cap", v.id, shot.width, shot.height);
  }
  await page.evaluate(() => window.__effScene.setVariant("spiral"));

  // Applications image: the story's last pose, tablets settled on the floor.
  if (uses) {
    const shot = await page.evaluate(
      (d, h) => {
        const sc = window.__effScene;
        sc.setSize(d, h);
        sc.copyWall = false;
        sc.yaw = -0.6;
        sc.setProgress(0.75, true);
        for (let i = 0; i < 80; i++) sc.render(performance.now() + i * 16, 1 / 60), sc.settle(1 / 60);
        sc.settle(3);
        sc.setProgress(0.8, true);
        return sc.snapshot();
      },
      hero0.d,
      hero0.h,
    );
    await sharp(png(shot)).resize(1600, 1000).webp({ quality: 84, alphaQuality: 85 }).toFile(path.join(out, "uses-tablets.webp"));
    product.images.uses = { src: "/images/eff/uses-tablets.webp", width: 1600, height: 1000 };
    console.log("uses");
  }

  const hero = product.sizes.find((s) => s.id === product.defaultSize);
  for (const [dir, url] of posters ? [["ltr", "/en"], ["rtl", "/fa"]] : []) {
    for (const [kind, vp] of [["wide", { width: 1600, height: 1000 }], ["tall", { width: 780, height: 1688 }]]) {
      await ready(page, `${url}/products/effervescent-tube?webgl`, vp);
      const shot = await page.evaluate(
        (d, h) => {
          const sc = window.__effScene;
          sc.setSize(d, h);
          sc.yaw = -0.35;
          sc.velocity = 0;
          sc.setProgress(0, true);
          // The glass waits with clear water: the live scene drops the tablet in from here.
          sc.glassMoment(0);
          return sc.snapshot();
        },
        hero.d,
        hero.h,
      );
      await sharp(png(shot)).resize(vp.width, vp.height).webp({ quality: 82, alphaQuality: 85 }).toFile(path.join(out, `hero-tube-${kind}-${dir}.webp`));
      console.log("poster", kind, dir);
    }
  }
  product.images.poster = { src: "/images/eff/hero-tube.webp", width: 1600, height: 1000 };
  fs.writeFileSync(jsonPath, JSON.stringify(product, null, 2) + "\n");
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
