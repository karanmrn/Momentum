import { describe, expect, it, vi } from "vitest";
import {
  collectPoliceOutcomes,
  createPoliceOutcomeClient,
  normalizePoliceOutcomes,
  policeOutcomeResultSchema,
  OUTCOME_LIMITS,
} from "../../packages/enrichment/police-outcomes.js";

const expected = {
  exampleId: "CAM-01",
  persistentId: "a".repeat(64),
  category: "violent-crime",
  month: "2026-07",
};
const now = () => new Date("2026-09-12T14:00:00Z");
const row = {
  category: { code: "under-investigation", name: "Under investigation" },
  date: "2026-07",
  person_id: "private-identity-value",
};
const response = (outcomes: unknown[] = [row]) => ({
  crime: {
    persistent_id: expected.persistentId,
    category: expected.category,
    month: expected.month,
  },
  outcomes,
});
const bytes = (data: unknown) => new TextEncoder().encode(JSON.stringify(data));

describe("Police outcome history", () => {
  it("retains duplicate outcome multiplicity without retaining identity fields", async () => {
    const normalized = await normalizePoliceOutcomes(
      bytes(response([row, row])),
      expected,
      now().toISOString(),
    );
    expect(normalized.status).toBe("available");
    if (normalized.status !== "available")
      throw new Error("Missing available history");
    expect(normalized.outcomes).toHaveLength(2);
    expect(normalized.outcomes[0].id).not.toBe(normalized.outcomes[1].id);
    expect(normalized.outcomes.map((item) => item.sourceIndex)).toEqual([0, 1]);
    expect(
      normalized.outcomes.every((item) => item.timePrecision === "month"),
    ).toBe(true);
    expect(JSON.stringify(normalized)).not.toContain("person_id");
    expect(JSON.stringify(normalized)).not.toContain("private-identity-value");
    expect(
      await normalizePoliceOutcomes(
        bytes(response([row, row])),
        expected,
        now().toISOString(),
      ),
    ).toEqual(normalized);
  });
  it("rejects crime ID, category and month mismatches", async () => {
    for (const field of ["persistent_id", "category", "month"] as const) {
      const source = response();
      source.crime[field] =
        field === "persistent_id"
          ? "b".repeat(64)
          : field === "category"
            ? "other-theft"
            : "2026-06";
      await expect(
        normalizePoliceOutcomes(bytes(source), expected, now().toISOString()),
      ).rejects.toThrow("crime_identity_mismatch");
    }
  });
  it("preserves missing fields as unknown and retains same-month outcomes separately", async () => {
    const normalized = await normalizePoliceOutcomes(
      bytes(
        response([
          row,
          {
            ...row,
            category: {
              code: "unable-to-prosecute",
              name: "Unable to prosecute suspect",
            },
          },
          { category: {}, date: null },
        ]),
      ),
      expected,
      now().toISOString(),
    );
    if (normalized.status !== "available")
      throw new Error("Missing available history");
    expect(normalized.outcomes.map((item) => item.month)).toEqual([
      "2026-07",
      "2026-07",
      null,
    ]);
    expect(normalized.outcomes[2]).toMatchObject({
      categoryCode: null,
      categoryName: null,
      timePrecision: "unknown",
    });
  });
  it("keeps 404 and source failure distinct from available empty history", async () => {
    const missing = await createPoliceOutcomeClient({
      fetch: vi.fn(async () => new Response(null, { status: 404 })),
      now,
    })(expected);
    const failed = await createPoliceOutcomeClient({
      fetch: vi.fn(async () => {
        throw new Error("source failure with sensitive text");
      }),
      now,
    })(expected);
    const empty = await normalizePoliceOutcomes(
      bytes(response([])),
      expected,
      now().toISOString(),
    );
    expect(missing).toMatchObject({
      status: "not_available",
      outcomes: null,
      sourceSnapshotSha256: null,
    });
    expect(failed).toMatchObject({
      status: "unavailable",
      outcomes: null,
      errorCode: "network_failure",
    });
    expect(JSON.stringify(failed)).not.toContain("sensitive text");
    expect(empty).toMatchObject({ status: "available", outcomes: [] });
  });
  it("halts remaining collection requests after 429 without retry", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { "retry-after": "120" } }),
    );
    const collection = await collectPoliceOutcomes(
      [
        expected,
        { ...expected, exampleId: "CAM-02", persistentId: "b".repeat(64) },
      ],
      createPoliceOutcomeClient({ fetch: fetcher, now }),
      now,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(collection.results[0]).toMatchObject({
      status: "rate_limited",
      retryAfterSeconds: 120,
      outcomes: null,
    });
    expect(collection.results[1]).toMatchObject({
      status: "not_attempted",
      errorCode: "rate_limit_halt",
      outcomes: null,
    });
  });
  it("bounds size, response count and stalled requests", async () => {
    const large = await createPoliceOutcomeClient({
      fetch: vi.fn(
        async () => new Response("x".repeat(OUTCOME_LIMITS.maxBytes + 1)),
      ),
      now,
    })(expected);
    expect(large).toMatchObject({
      status: "unavailable",
      errorCode: "response_too_large",
    });
    await expect(
      normalizePoliceOutcomes(
        bytes(response(Array.from({ length: 501 }, () => row))),
        expected,
        now().toISOString(),
      ),
    ).rejects.toThrow("invalid_response");
    const hung = await createPoliceOutcomeClient({
      fetch: () => new Promise<Response>(() => {}),
      timeoutMs: 5,
      now,
    })(expected);
    expect(hung).toMatchObject({ status: "unavailable", errorCode: "timeout" });
  });
  it("rejects persisted identity fields and inconsistent source lineage", async () => {
    const normalized = await normalizePoliceOutcomes(
      bytes(response()),
      expected,
      now().toISOString(),
    );
    if (normalized.status !== "available")
      throw new Error("Missing available history");
    expect(
      policeOutcomeResultSchema.safeParse({
        ...normalized,
        person_id: "private",
      }).success,
    ).toBe(false);
    expect(
      policeOutcomeResultSchema.safeParse({
        ...normalized,
        sourceUrl: normalized.sourceUrl.replace(/a$/, "b"),
      }).success,
    ).toBe(false);
    const tampered = structuredClone(normalized);
    tampered.outcomes[0].sourceSnapshotSha256 = "0".repeat(64);
    expect(policeOutcomeResultSchema.safeParse(tampered).success).toBe(false);
  });
  it("validates request bounds before network and rejects redirects", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com" },
        }),
    );
    const client = createPoliceOutcomeClient({ fetch: fetcher, now });
    await expect(
      client({ ...expected, persistentId: "../other" }),
    ).rejects.toThrow();
    await expect(
      collectPoliceOutcomes(Array(6).fill(expected), client, now),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await client(expected)).toMatchObject({
      status: "unavailable",
      errorCode: "redirect_rejected",
    });
  });
});
