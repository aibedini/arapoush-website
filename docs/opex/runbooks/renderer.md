# 3D renderer (P10)

**What it renders.** The effervescent page shows images rendered from its own 3D scene:
- the size line-up, with dimension marks;
- the exploded caps;
- the applications image;
- the four hero posters (wide and tall, each reading direction).

The `opex-renderer` service makes these automatically.

## How it works

1. **A job is queued** when a super admin changes a render input in the effervescent draft:
   - a size's diameter or height, or a size added or removed;
   - a cap variant added or removed;
   - `renderPxPerMm` or `defaultSize`.

   Marker positions, names and photos do not trigger a render. **Render again** in the console's
   effervescent editor queues one by hand (super admin, step-up).
2. **The renderer claims the job** (`RENDER_TOKEN`) and opens the website with `?webgl&render`,
   which exposes the scene handle. It renders in headless Chromium with SwiftShader, exactly as
   `apps/web/scripts/render-effervescent.cjs` did by hand.
3. **Each PNG goes through the media pipeline** (sniffed, re-encoded to WebP, scanned) as an asset
   owned by the renderer.
4. **OPEX writes a new draft revision** ("3D renders (job …)") that changes **only** the rendered
   fields:
   - `sizes[*].render` (image + base, mouth, left and right marks);
   - `caps.variants[*].image`;
   - `images.uses` and `images.posters`.

   Everything else in the draft stays as it was.
5. **Operators review and publish** the revision as usual. The console shows job status, and the
   editor reloads when a render finishes.

**Failures:** a failed job is retried (three attempts), then stays `failed` with its error. A newer
job supersedes older pending ones. A renderer that dies mid-job is detected after 15 minutes, and
the job is claimed again.

## Operate

- **Logs:** `docker compose … logs -f opex-renderer`, one JSON line per image.
- **Time:** about 2 minutes per job (5 sizes, 2 caps, 4 posters) on a 2-vCPU host.
- **Run locally** against dev servers, with Chrome on the workstation:
  ```bash
  OPEX_URL=http://localhost:4000 RENDER_SITE_URL=http://localhost:3210 CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
    node --env-file=.env.local --no-warnings apps/opex-renderer/src/main.ts --once
  ```
- **Security:**
  - the renderer only opens the internal website address;
  - it runs read-only, with no Linux capabilities, on the internal network;
  - its token can only claim jobs, upload images to them, and complete or fail them;
  - OPEX accepts only assets the renderer itself uploaded.
