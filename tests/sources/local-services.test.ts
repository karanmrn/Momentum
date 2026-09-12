import { describe, expect, it } from "vitest";
import {
  getLocalHelp,
  getLocalSources,
} from "../../services/data/local-services";
import { pilotSchema, type PilotId } from "../../packages/contracts/index";

describe("local service evidence", () => {
  it("keeps service links separate from live source status", () => {
    for (const pilot of pilotSchema.options) {
      for (const card of getLocalSources(pilot)) {
        expect(card.status).toBe("link_only");
        expect(card.fetchedAt).toBe("2026-09-12T12:08:48Z");
        expect(card.publishedAt).toBeNull();
        expect(card.synthetic).toBe(false);
        expect(card.scope).toContain("borough");
        expect(card.summary.split(/\s+/).length).toBeLessThanOrEqual(50);
        expect(new URL(card.url).protocol).toBe("https:");
      }
    }
  });

  it("does not turn borough support into confirmed local refuges", () => {
    for (const pilot of ["hounslow_town_centre", "west_croydon"] as const) {
      const cards = getLocalHelp(pilot);
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.pilotId).toBe(pilot);
        expect(card.availability).toBe("unconfirmed");
        expect(card.schedule).toBeNull();
        expect(card.summary).toContain("borough");
        expect(card.summary).toContain("not a");
        expect(card.summary.split(/\s+/).length).toBeLessThanOrEqual(50);
      }
    }
    expect(getLocalSources("camden_town")).toEqual([]);
    expect(getLocalHelp("camden_town")).toEqual([]);
  });

  it("protects stored evidence from caller mutation and rejects unknown pilots", () => {
    getLocalSources("hounslow_town_centre")[0].status = "available";
    getLocalHelp("west_croydon")[0].summary = "Changed";
    expect(getLocalSources("hounslow_town_centre")[0].status).toBe("link_only");
    expect(getLocalHelp("west_croydon")[0].summary).not.toBe("Changed");
    expect(() => getLocalSources("unknown" as PilotId)).toThrow();
    expect(() => getLocalHelp("unknown" as PilotId)).toThrow();
  });
});
