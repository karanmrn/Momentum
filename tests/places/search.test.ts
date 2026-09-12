import { describe, expect, it } from "vitest";
import {
  searchPlaces,
  type PlaceSearchRow,
} from "../../packages/places/src/search";

const pilotId = "camden_town";
const row = (
  id: string,
  name: string,
  extra: Partial<PlaceSearchRow> = {},
): PlaceSearchRow => ({ id, name, pilotId, category: "library", ...extra });

describe("research place search", () => {
  it("ranks exact, word prefix, and substring matches without fuzzy matches", () => {
    const records = [
      row("inside", "Fairbanks"),
      row("word", "North Bank Library"),
      row("fuzzy", "Back entrance"),
      row("exact", "Bank"),
      row("prefix", "Bank House"),
    ];
    expect(
      searchPlaces(records, { pilotId, query: "  BANK  " }).rows.map(
        (place) => place.id,
      ),
    ).toEqual(["exact", "prefix", "word", "inside"]);
    expect(
      searchPlaces([row("inside", "Cabinet")], { pilotId, query: "b" }).total,
    ).toBe(0);
  });

  it("normalizes repeated whitespace in names and queries", () => {
    expect(
      searchPlaces([row("one", "North  Bank")], {
        pilotId,
        query: " NORTH   BANK ",
      }).total,
    ).toBe(1);
  });

  it("keeps pilot and category filters exact", () => {
    const records = [
      row("local", "Central Library"),
      row("station", "Central Station", { category: "station" }),
      row("other", "Central Library", { pilotId: "west_croydon" }),
    ];
    expect(
      searchPlaces(records, { pilotId, category: "library" }).rows,
    ).toEqual([records[0]]);
    expect(searchPlaces(records, { pilotId, category: "unknown" }).total).toBe(
      0,
    );
    expect(() => searchPlaces(records, { pilotId: "all" })).toThrow();
  });

  it("orders ties by name then ID and does not mutate records", () => {
    const records = Object.freeze([
      Object.freeze({
        ...row("b", "Same"),
        sourceUrl: "https://example.test/b",
      }),
      Object.freeze({
        ...row("a", "Same"),
        sourceUrl: "https://example.test/a",
      }),
    ]);
    const result = searchPlaces(records, { pilotId });
    expect(result.rows.map((place) => place.id)).toEqual(["a", "b"]);
    expect(result.rows[0]).toBe(records[1]);
    expect(result.rows[0].sourceUrl).toBe("https://example.test/a");
    expect(records.map((place) => place.id)).toEqual(["b", "a"]);
  });

  it("makes every matching record reachable across pages without repetition", () => {
    const records = Array.from({ length: 53 }, (_, index) =>
      row(`place-${index}`, `Library ${index.toString().padStart(2, "0")}`),
    );
    const pages = [1, 2, 3].map((page) =>
      searchPlaces(records, { pilotId, query: "library", page }),
    );
    expect(pages.map((page) => page.rows.length)).toEqual([20, 20, 13]);
    expect(
      pages.every((page) => page.total === 53 && page.pageCount === 3),
    ).toBe(true);
    const ids = pages.flatMap((page) => page.rows.map((place) => place.id));
    expect(ids).toEqual(records.map((place) => place.id));
    expect(new Set(ids).size).toBe(53);
    expect(searchPlaces(records, { pilotId, page: 4 }).rows).toEqual([]);
    expect(
      searchPlaces(records, { pilotId, page: Number.MAX_SAFE_INTEGER }).rows,
    ).toEqual([]);
  });

  it("returns explicit empty counts and bounded custom page sizes", () => {
    expect(searchPlaces([], { pilotId })).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 20,
      pageCount: 0,
    });
    expect(
      searchPlaces([row("a", "A"), row("b", "B")], {
        pilotId,
        page: 2,
        pageSize: 1,
      }).rows.map((place) => place.id),
    ).toEqual(["b"]);
  });

  it("rejects invalid paging and oversized text", () => {
    for (const page of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => searchPlaces([], { pilotId, page })).toThrow();
    }
    for (const pageSize of [0, -1, 1.5, 101, NaN, Infinity]) {
      expect(() => searchPlaces([], { pilotId, pageSize })).toThrow();
    }
    expect(() =>
      searchPlaces([], { pilotId, query: "x".repeat(121) }),
    ).toThrow();
    expect(() => searchPlaces([], { pilotId, category: " " })).toThrow();
    expect(() =>
      searchPlaces([], { pilotId, category: "x".repeat(121) }),
    ).toThrow();
  });

  it("rejects duplicate IDs without merging conflicting records", () => {
    const original = row("same", "Library");
    expect(() => searchPlaces([original, original], { pilotId })).toThrow(
      "Duplicate place ID",
    );
    expect(() =>
      searchPlaces(
        [original, row("same", "Station", { category: "station" })],
        {
          pilotId,
          category: "library",
        },
      ),
    ).toThrow("Duplicate place ID");
    expect(
      searchPlaces(
        [original, row("same", "Other", { pilotId: "west_croydon" })],
        {
          pilotId,
        },
      ).rows,
    ).toEqual([original]);
  });
});
