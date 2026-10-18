/**
 * The contract the breaker is given. This is the ONLY input it receives about
 * the change under review — no diff, no author notes, no reviewer output.
 */
export interface Invariant {
  id: string;
  /** Externally observable claim, stated so it can be falsified. */
  claim: string;
  /** Route the claim applies to. */
  route: string;
  /**
   * The request that exercises the claim, for routes that are not simple page
   * fetches (an API that must refuse a hostile body, for instance). Absent
   * means GET, with the page-oriented vectors.
   */
  request?: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    /**
     * Expands every `{{pad}}` in `body` to `length` copies of `char`, so a
     * contract can describe an oversized payload without carrying it.
     */
    pad?: { char: string; length: number };
  };
  /** What must hold in the response. At least one assertion is required. */
  expect: {
    status?: number;
    /** Substrings that must appear in the raw response body. */
    bodyIncludes?: string[];
    /** Substrings that must NOT appear (leaked drafts, debug banners, stack traces). */
    bodyExcludes?: string[];
    /** Response headers that must be present, compared case-insensitively. */
    headers?: Record<string, string>;
    /** CSS selectors that must match at least once in the raw HTML. */
    selectors?: string[];
    /** Minimum characters of visible text in the raw HTML. */
    minVisibleText?: number;
  };
}

export interface Contract {
  name: string;
  invariants: Invariant[];
}

export function parseContract(raw: string): Contract {
  const data = JSON.parse(raw) as Partial<Contract>;
  if (!data.name || !Array.isArray(data.invariants) || data.invariants.length === 0) {
    throw new Error("contract must have a name and a non-empty invariants array");
  }
  for (const inv of data.invariants) {
    if (!inv.id || !inv.claim || !inv.route || !inv.expect) {
      throw new Error(`invariant ${inv.id ?? "<unnamed>"} is missing id, claim, route or expect`);
    }
    if (Object.keys(inv.expect).length === 0) {
      throw new Error(`invariant ${inv.id} declares no assertion; it cannot be falsified`);
    }
    if (inv.request !== undefined && !/^[A-Z]+$/.test(inv.request.method ?? "")) {
      throw new Error(`invariant ${inv.id}: request.method must be an upper-case HTTP method`);
    }
    if (inv.request?.pad !== undefined) {
      const { char, length } = inv.request.pad;
      if (typeof char !== "string" || char.length !== 1 || !Number.isInteger(length) || length < 1 || length > 5_000_000) {
        throw new Error(`invariant ${inv.id}: request.pad needs a one-character "char" and an integer "length" up to 5000000`);
      }
    }
  }
  return data as Contract;
}
