import { afterEach, describe, expect, it, vi } from "vitest";
import { getCamdenLighting } from "../../services/ingestion/camden-lighting";

const row = {
  local_authority_asset_number: "1003",
  street_name: "PANCRAS ROAD",
  longitude: "-0.132216",
  latitude: "51.535394",
  last_uploaded: "2026-09-05T14:40:12.000",
};
afterEach(() => vi.unstubAllGlobals());
describe("Camden lighting inventory", () => {
  it("retrieves a bounded sample without asserting lamp operation", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([row])));
    vi.stubGlobal("fetch", fetch);
    const card = await getCamdenLighting();
    expect(card.status).toBe("available");
    expect(card.recordCount).toBe(1);
    expect(card.coverage).toBe("sample");
    expect(card.summary).toContain("Sample: 1 lighting assets across 1 named streets");
    expect(card.summary).toContain("not a total");
    expect(card.summary).toContain("Current lamp operation is unknown");
    expect(card.publishedAt).toBeNull();
    expect(card.fetchedAt).toMatch(/^\d{4}-/);
    expect(card.synthetic).toBe(false);
    expect(card.sourceKind).toBe("map_inventory");
    expect(card.scope).toContain("not an approved pilot polygon");
    const [url, options] = fetch.mock.calls[0]!;
    expect(new URL(url).hostname).toBe("opendata.camden.gov.uk");
    expect(new URL(url).searchParams.get("$limit")).toBe("200");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    [], {}, [{ ...row, latitude: "0" }], [{ ...row, longitude: "" }],
    [{ ...row, local_authority_asset_number: null }], [row, row],
    Array.from({length: 201}, (_, i) => ({...row, local_authority_asset_number: String(i)})),
  ])("keeps empty, malformed and out-of-scope samples unavailable: %j", async input => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(input))));
    const card = await getCamdenLighting();
    expect(card.status).toBe("unavailable");
    expect(card.fetchedAt).toBeNull();
    expect(card.summary).toContain("unknown");
  });
  it("keeps upstream errors unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await getCamdenLighting()).status).toBe("unavailable");
  });
  it("rejects HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {status: 429})));
    expect((await getCamdenLighting()).status).toBe("unavailable");
  });
  it.each(["invalid JSON", "x".repeat(500_001)])("rejects invalid or oversized responses", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    expect((await getCamdenLighting()).status).toBe("unavailable");
  });
});
