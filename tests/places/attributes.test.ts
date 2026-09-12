import { describe, expect, it } from "vitest";
import { parseOsmAttribute } from "../../packages/places/src/attributes";

describe("OSM attribute claims", () => {
  it.each(["yes", "no", "limited"] as const)(
    "preserves the exact %s claim",
    (rawValue) => {
      expect(parseOsmAttribute(rawValue)).toEqual({
        state: rawValue,
        rawValue,
      });
    },
  );

  it.each([
    "yes (Sundays)",
    "yes @ (Mo-Fr 09:00-17:00)",
    "no @ (Sa-Su)",
    "limited;yes",
    "designated",
    "customers",
    "private",
    "permissive",
    "unknown",
    "N/A",
    "true",
    "false",
    "1",
    "0",
    "Yes",
    "NO",
    "Limited",
    " yes ",
    "",
  ])("retains an unsupported source value: %j", (rawValue) => {
    expect(parseOsmAttribute(rawValue)).toEqual({ state: "unknown", rawValue });
  });

  it.each([undefined, null, false, true, 0, 1, {}, ["yes"]])(
    "does not invent a claim from a non-string value: %j",
    (raw) => {
      expect(parseOsmAttribute(raw)).toEqual({
        state: "unknown",
        rawValue: null,
      });
    },
  );

  it("does not coerce an object into a source claim", () => {
    const raw = {
      toString() {
        throw new Error("Source objects must not be converted to strings.");
      },
    };
    expect(parseOsmAttribute(raw)).toEqual({
      state: "unknown",
      rawValue: null,
    });
  });

  it("keeps absence, limited access, and missing information distinct", () => {
    const tags = { wheelchair: "limited", "toilets:wheelchair": "no" };
    expect(parseOsmAttribute(tags.wheelchair).state).toBe("limited");
    expect(parseOsmAttribute(tags["toilets:wheelchair"]).state).toBe("no");
    expect(parseOsmAttribute(undefined).state).toBe("unknown");
  });
});
