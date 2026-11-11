// Load test (docs/opex/runbooks/security-testing.md). Public surfaces only: no credentials needed.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE || "http://localhost:3000";
const OPEX = __ENV.OPEX || "http://localhost:4000";
const pages = ["/fa", "/en", "/fa/printing", "/fa/products/effervescent-tube", "/en/products/multi-layer-tube", "/sitemap.xml", "/llms.txt"];

export const options = {
  scenarios: {
    site: { executor: "constant-arrival-rate", rate: 200, timeUnit: "1s", duration: "2m", preAllocatedVUs: 100, exec: "site" },
    api: { executor: "constant-arrival-rate", rate: 20, timeUnit: "1s", duration: "2m", preAllocatedVUs: 20, exec: "api" },
  },
  thresholds: {
    "http_req_duration{scenario:site}": ["p(95)<300"],
    "http_req_failed{scenario:api}": ["rate<0.01"],
  },
};

export function site() {
  const r = http.get(BASE + pages[Math.floor(Math.random() * pages.length)]);
  check(r, { "200": (x) => x.status === 200 });
}

export function api() {
  const r = http.get(`${OPEX}/.well-known/jwks.json`);
  check(r, { jwks: (x) => x.status === 200 });
  // Unauthenticated partner calls must be refused fast, never 5xx.
  const p = http.get(`${OPEX}/v1/partner/me`);
  check(p, { "401": (x) => x.status === 401 });
  sleep(0.1);
}
