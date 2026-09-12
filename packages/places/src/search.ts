// Adapted from PUBMAXX lib/ukBasePubSearch.ts at e9a412be1.
// Reuses resident-record name matching. No location, network, or risk model is used.
import { pilotSchema } from "../../contracts";

export interface PlaceSearchRow {
  id: string;
  name: string;
  pilotId: string;
  category: string;
}

export interface PlaceSearchOptions {
  pilotId: string;
  query?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface PlaceSearchResult<T extends PlaceSearchRow> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const PLACE_SEARCH_MAX_QUERY_LENGTH = 120;
export const PLACE_SEARCH_MAX_PAGE_SIZE = 100;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

function matchTier(name: string, query: string): number | null {
  if (!query) return 0;
  const normalizedName = normalize(name);
  if (normalizedName === query) return 0;
  if (
    normalizedName.startsWith(query) ||
    normalizedName.split(" ").some((word) => word.startsWith(query))
  ) {
    return 1;
  }
  if (query.length >= 2 && normalizedName.includes(query)) return 2;
  return null;
}

/** Search validated place rows. Pages start at one. Duplicate IDs are rejected per pilot. */
export function searchPlaces<T extends PlaceSearchRow>(
  rows: readonly T[],
  options: PlaceSearchOptions,
): PlaceSearchResult<T> {
  const pilotId = pilotSchema.parse(options.pilotId);
  const rawQuery = options.query ?? "";
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  if (
    typeof rawQuery !== "string" ||
    rawQuery.length > PLACE_SEARCH_MAX_QUERY_LENGTH
  ) {
    throw new RangeError("Place query must contain at most 120 characters.");
  }
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError("Place page must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PLACE_SEARCH_MAX_PAGE_SIZE
  ) {
    throw new RangeError("Place page size must be an integer from 1 to 100.");
  }
  if (
    options.category !== undefined &&
    (typeof options.category !== "string" ||
      !options.category.trim() ||
      options.category.length > PLACE_SEARCH_MAX_QUERY_LENGTH)
  ) {
    throw new RangeError(
      "Place category must contain from 1 to 120 characters.",
    );
  }

  const query = normalize(rawQuery);
  const seen = new Set<string>();
  const matches: Array<{ row: T; tier: number }> = [];
  for (const row of rows) {
    if (row.pilotId !== pilotId) continue;
    if (seen.has(row.id)) {
      throw new Error("Duplicate place ID in the selected pilot.");
    }
    seen.add(row.id);
    if (options.category !== undefined && row.category !== options.category) {
      continue;
    }
    const tier = matchTier(row.name, query);
    if (tier !== null) matches.push({ row, tier });
  }
  matches.sort(
    (left, right) =>
      left.tier - right.tier ||
      left.row.name.localeCompare(right.row.name, "en-GB") ||
      left.row.id.localeCompare(right.row.id, "en-GB"),
  );
  const total = matches.length;
  const pageCount = Math.ceil(total / pageSize);
  return {
    rows:
      page > pageCount
        ? []
        : matches
            .slice((page - 1) * pageSize, page * pageSize)
            .map(({ row }) => row),
    total,
    page,
    pageSize,
    pageCount,
  };
}
