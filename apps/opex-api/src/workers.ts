import type { FastifyBaseLogger } from "fastify";
import type { Deps } from "./app.ts";

/** Background jobs (webhook delivery, scheduled publishing, expiry). Each phase registers its job. */
export type Job = { name: string; everyMs: number; run: (deps: Deps, log: FastifyBaseLogger) => Promise<void> };
export const JOBS: Job[] = [];

export function startWorkers(deps: Deps, log: FastifyBaseLogger): () => void {
  const timers = JOBS.map((job) => {
    let running = false;
    return setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await job.run(deps, log);
      } catch (err) {
        log.error({ err, job: job.name }, "job failed");
      } finally {
        running = false;
      }
    }, job.everyMs);
  });
  return () => timers.forEach(clearInterval);
}
