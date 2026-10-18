import type { Invariant } from "./contract.ts";

/**
 * A falsifying vector: one hostile way of requesting the same thing.
 *
 * The point is not to re-run the happy path. It is to find the request shape
 * under which the claim stops holding — the shapes real crawlers, proxies,
 * link shorteners and copy-pasted URLs produce every day.
 */
export interface Vector {
  name: string;
  rationale: string;
  method: "GET" | "HEAD" | "DECLARED";
  transformRoute: (route: string) => string;
  headers: Record<string, string>;
  /** Vectors whose response body is not expected to be the document. */
  bodyless?: boolean;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const vectors: readonly Vector[] = [
  {
    name: "baseline",
    rationale: "the happy path, so a failure elsewhere can be attributed to the vector",
    method: "GET",
    transformRoute: (r) => r,
    headers: { "user-agent": BROWSER_UA, accept: "text/html" },
  },
  {
    name: "no-javascript-agent",
    rationale:
      "AI crawlers fetch raw HTML and never execute JavaScript; content that needs hydration is invisible to them",
    method: "GET",
    transformRoute: (r) => r,
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      accept: "text/html",
    },
  },
  {
    name: "trailing-slash-flip",
    rationale: "a route that only works with one slash form splits its ranking signals",
    method: "GET",
    transformRoute: (r) => (r.endsWith("/") && r !== "/" ? r.slice(0, -1) : `${r}/`),
    headers: { "user-agent": BROWSER_UA, accept: "text/html" },
  },
  {
    name: "cache-busted",
    rationale: "a query string must not change the document or the canonical it declares",
    method: "GET",
    transformRoute: (r) => `${r}${r.includes("?") ? "&" : "?"}_kit=${Date.now()}`,
    headers: { "user-agent": BROWSER_UA, accept: "text/html", "cache-control": "no-cache" },
  },
  {
    name: "no-accept-header",
    rationale: "naive clients send no Accept; content negotiation must not degrade to an error",
    method: "GET",
    transformRoute: (r) => r,
    headers: { "user-agent": BROWSER_UA },
  },
  {
    name: "head-request",
    rationale: "link checkers and preview bots probe with HEAD; it must not 404 or 500",
    method: "HEAD",
    transformRoute: (r) => r,
    headers: { "user-agent": BROWSER_UA },
    bodyless: true,
  },
];

/**
 * Vectors for invariants that declare their own request. The request itself is
 * sent as written (method, headers, body); these vary only the client.
 */
const requestVectors: readonly Vector[] = [
  {
    name: "declared-request",
    rationale: "the request exactly as the contract describes it",
    method: "DECLARED",
    transformRoute: (r) => r,
    headers: {},
  },
  {
    name: "crawler-user-agent",
    rationale:
      "an automated client must be refused or answered by the same rules as a browser, never by a looser path",
    method: "DECLARED",
    transformRoute: (r) => r,
    headers: { "user-agent": "Mozilla/5.0 (compatible; ExampleBot/1.0; +https://example.com/bot)" },
  },
];

/**
 * Vectors applicable to an invariant.
 *
 * Two vectors are withheld where they would assert something untrue rather than
 * something hostile:
 *  - HEAD, when the invariant makes claims about the body;
 *  - the trailing-slash flip on the site root (there is no other form of "/")
 *    and on file routes like /robots.txt, where "/robots.txt/" is expected to
 *    404 and demanding otherwise would be wrong.
 */
export function vectorsFor(inv: Invariant): readonly Vector[] {
  // An invariant that declares its own request is about that request, not about
  // a page: the declared request is the baseline, and the only variation that
  // makes sense is who is asking.
  if (inv.request) return requestVectors;

  const needsBody =
    !!inv.expect.bodyIncludes?.length ||
    !!inv.expect.selectors?.length ||
    inv.expect.minVisibleText !== undefined;

  const path = inv.route.split("?")[0] ?? inv.route;
  const isFileRoute = /\.[a-z0-9]+$/i.test(path);
  // An API route has one address: a trailing-slash redirect on /api/x is the
  // framework's normal behaviour and says nothing about the claim.
  const isApiRoute = path.startsWith("/api/");
  const slashFlipApplies = path !== "/" && !isFileRoute && !isApiRoute;

  return vectors.filter((v) => {
    if (needsBody && v.bodyless) return false;
    if (v.name === "trailing-slash-flip" && !slashFlipApplies) return false;
    return true;
  });
}
