import { describe, expect, it } from "vitest";
import {
  getCamdenHelp,
  getCamdenHelpCacheTtl,
} from "../../services/data/camden-help.js";
const bus = (time: string) =>
  getCamdenHelp(new Date(time)).find((row) => row.id === "C01")!;
describe("Camden dated bus relocation", () => {
  it.each([
    "2026-09-11T21:30:00+01:00",
    "2026-09-12T00:30:00+01:00",
    "2026-09-12T02:29:59+01:00",
  ])("keeps Friday service at its normal location: %s", (time) => {
    expect(bus(time).address).toBe("Outside Camden Town Underground station");
  });
  it.each([
    "2026-09-12T02:30:00+01:00",
    "2026-09-12T12:00:00+01:00",
    "2026-09-12T21:30:00+01:00",
    "2026-09-13T00:30:00+01:00",
    "2026-09-13T02:29:59+01:00",
  ])("shows dated planning and overnight location: %s", (time) => {
    const row = bus(time);
    expect(row.address).toBe("Outside KOKO on Camden High Street");
    expect(row.summary).toContain("Saturday 12 September");
    expect(row.schedule).toContain("Sunday 13 September, 02:30");
    expect(row.coordinates).toBeUndefined();
    expect(row.availability).toBe("unconfirmed");
    expect(row.checkedAt).toBe("2026-09-12T14:18:31.995Z");
  });
  it.each([
    "2026-09-13T02:30:00+01:00",
    "2026-09-18T21:30:00+01:00",
    "2027-09-12T21:30:00+01:00",
  ])("expires the exception without repeating next year: %s", (time) => {
    expect(bus(time).address).toBe("Outside Camden Town Underground station");
    expect(bus(time).summary).not.toContain("KOKO");
  });
  it("preserves other venues and source dates without mutation", () => {
    const before = getCamdenHelp(new Date("2026-09-11T20:00:00Z")).slice(1),
      during = getCamdenHelp(new Date("2026-09-12T20:00:00Z")).slice(1);
    expect(during).toEqual(before);
    during[0].name = "Changed";
    expect(getCamdenHelp()[1].name).not.toBe("Changed");
  });
  it("caps cache life at each date boundary", () => {
    expect(getCamdenHelpCacheTtl(new Date("2026-09-12T02:29:59+01:00"))).toBe(
      1000,
    );
    expect(getCamdenHelpCacheTtl(new Date("2026-09-13T02:29:59+01:00"))).toBe(
      1000,
    );
    expect(getCamdenHelpCacheTtl(new Date("2026-09-13T02:30:00+01:00"))).toBe(
      300000,
    );
  });
  it("rejects an invalid clock", () => {
    expect(() => getCamdenHelp(new Date("invalid"))).toThrow();
    expect(() => getCamdenHelpCacheTtl(new Date("invalid"))).toThrow();
  });
});
