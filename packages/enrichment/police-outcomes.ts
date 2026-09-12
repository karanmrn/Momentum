import { z } from "zod";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const timestamp = z.string().datetime({ offset: true });
const text = z.string().min(1).max(300);
const categoryCode = z.string().regex(/^[a-z][a-z-]{0,79}$/);
const endpoint = "https://data.police.uk/api/outcomes-for-crime/";
export const OUTCOME_LIMITS = {
  maxCrimes: 5,
  maxOutcomes: 500,
  maxBytes: 256_000,
  timeoutMs: 15_000,
} as const;
export const expectedCrimeSchema = z
  .object({
    exampleId: z.string().regex(/^CAM-0[1-5]$/),
    persistentId: hashSchema,
    category: categoryCode,
    month: monthSchema,
  })
  .strict();
export type ExpectedCrime = z.infer<typeof expectedCrimeSchema>;
const sourceUrlSchema = z
  .string()
  .refine(
    (value) =>
      value.startsWith(endpoint) &&
      hashSchema.safeParse(value.slice(endpoint.length)).success,
  );
// Deliberately select only public outcome fields. Identity and unrelated source fields are discarded.
const responseSchema = z.object({
  crime: z.object({
    persistent_id: hashSchema,
    category: categoryCode,
    month: monthSchema,
  }),
  outcomes: z
    .array(
      z.object({
        category: z.object({
          code: categoryCode.nullish(),
          name: text.nullish(),
        }),
        date: monthSchema.nullish(),
      }),
    )
    .max(OUTCOME_LIMITS.maxOutcomes),
});
const outcomeSchema = z
  .object({
    id: hashSchema,
    sourceIndex: z
      .number()
      .int()
      .min(0)
      .max(OUTCOME_LIMITS.maxOutcomes - 1),
    sourceSnapshotSha256: hashSchema,
    categoryCode: categoryCode.nullable(),
    categoryName: text.nullable(),
    month: monthSchema.nullable(),
    timePrecision: z.enum(["month", "unknown"]),
    synthetic: z.literal(false),
  })
  .strict()
  .superRefine((row, ctx) => {
    if ((row.month === null) !== (row.timePrecision === "unknown"))
      ctx.addIssue({
        code: "custom",
        message: "Outcome time precision is inconsistent.",
      });
  });
const baseResult = {
  expectedCrime: expectedCrimeSchema,
  sourceUrl: sourceUrlSchema,
  fetchedAt: timestamp,
  sourceFamilyId: z.literal("police-uk"),
  originGroupId: z.null(),
  synthetic: z.literal(false),
  alertEligible: z.literal(false),
  containsPersonIdentifiers: z.literal(false),
};
const availableSchema = z
  .object({
    ...baseResult,
    status: z.literal("available"),
    httpStatus: z.literal(200),
    sourceSnapshotSha256: hashSchema,
    responseBytes: z.number().int().min(1).max(OUTCOME_LIMITS.maxBytes),
    lineage: z.literal("exact_persistent_id_category_and_month"),
    outcomes: z.array(outcomeSchema).max(OUTCOME_LIMITS.maxOutcomes),
  })
  .strict();
const failedSchema = z
  .object({
    ...baseResult,
    status: z.enum([
      "not_available",
      "unavailable",
      "rate_limited",
      "not_attempted",
    ]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    sourceSnapshotSha256: z.null(),
    outcomes: z.null(),
    lineage: z.literal("not_verified"),
    errorCode: z.enum([
      "not_found",
      "rate_limited",
      "rate_limit_halt",
      "http_error",
      "network_failure",
      "timeout",
      "response_too_large",
      "invalid_response",
      "crime_identity_mismatch",
      "redirect_rejected",
    ]),
    retryAfterSeconds: z.number().int().min(0).max(86400).nullable(),
  })
  .strict();
export const policeOutcomeResultSchema = z
  .discriminatedUnion("status", [availableSchema, failedSchema])
  .superRefine((result, ctx) => {
    if (result.sourceUrl !== endpoint + result.expectedCrime.persistentId)
      ctx.addIssue({
        code: "custom",
        message: "Outcome request identity does not match its source URL.",
      });
    if (result.status === "available") {
      if (
        new Set(result.outcomes.map((row) => row.id)).size !==
          result.outcomes.length ||
        result.outcomes.some(
          (row, index) =>
            row.sourceIndex !== index ||
            row.sourceSnapshotSha256 !== result.sourceSnapshotSha256,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Outcome snapshot lineage or multiplicity is invalid.",
        });
      }
    }
  });
export type PoliceOutcomeResult = z.infer<typeof policeOutcomeResultSchema>;
export const policeOutcomeCollectionSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    methodVersion: z.literal("police-outcomes/1"),
    collectedAt: timestamp,
    sourceDocumentation: z.literal(
      "https://data.police.uk/docs/method/outcomes-for-crime/",
    ),
    sourceFamilyId: z.literal("police-uk"),
    synthetic: z.literal(false),
    results: z
      .array(policeOutcomeResultSchema)
      .min(1)
      .max(OUTCOME_LIMITS.maxCrimes),
    limitations: z.array(z.string().min(1).max(500)).min(1).max(12),
  })
  .strict()
  .superRefine((collection, ctx) => {
    if (
      new Set(
        collection.results.map((result) => result.expectedCrime.persistentId),
      ).size !== collection.results.length ||
      new Set(
        collection.results.map((result) => result.expectedCrime.exampleId),
      ).size !== collection.results.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Requested crime identities must be distinct.",
      });
  });
export type PoliceOutcomeCollection = z.infer<
  typeof policeOutcomeCollectionSchema
>;
async function digest(bytes: Uint8Array | string): Promise<string> {
  const input =
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
class OutcomeError extends Error {
  constructor(
    readonly code:
      | "response_too_large"
      | "invalid_response"
      | "crime_identity_mismatch"
      | "timeout",
  ) {
    super(code);
  }
}
export function outcomeSourceUrl(input: unknown): string {
  return endpoint + hashSchema.parse(input);
}
export async function normalizePoliceOutcomes(
  bytes: Uint8Array,
  expectedInput: unknown,
  fetchedAt: string,
): Promise<PoliceOutcomeResult> {
  const expectedCrime = expectedCrimeSchema.parse(expectedInput);
  timestamp.parse(fetchedAt);
  if (bytes.length > OUTCOME_LIMITS.maxBytes)
    throw new OutcomeError("response_too_large");
  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    throw new OutcomeError("invalid_response");
  }
  if (
    parsed.crime.persistent_id !== expectedCrime.persistentId ||
    parsed.crime.category !== expectedCrime.category ||
    parsed.crime.month !== expectedCrime.month
  )
    throw new OutcomeError("crime_identity_mismatch");
  const sourceSnapshotSha256 = await digest(bytes);
  const outcomes = await Promise.all(
    parsed.outcomes.map(async (row, sourceIndex) => ({
      id: await digest(`${sourceSnapshotSha256}:${sourceIndex}`),
      sourceIndex,
      sourceSnapshotSha256,
      categoryCode: row.category.code ?? null,
      categoryName: row.category.name ?? null,
      month: row.date ?? null,
      timePrecision: row.date ? "month" : "unknown",
      synthetic: false,
    })),
  );
  return policeOutcomeResultSchema.parse({
    expectedCrime,
    sourceUrl: outcomeSourceUrl(expectedCrime.persistentId),
    fetchedAt,
    sourceFamilyId: "police-uk",
    originGroupId: null,
    synthetic: false,
    alertEligible: false,
    containsPersonIdentifiers: false,
    status: "available",
    httpStatus: 200,
    sourceSnapshotSha256,
    responseBytes: bytes.length,
    lineage: "exact_persistent_id_category_and_month",
    outcomes,
  });
}
function failure(
  expectedCrime: ExpectedCrime,
  fetchedAt: string,
  status: z.infer<typeof failedSchema>["status"],
  errorCode: z.infer<typeof failedSchema>["errorCode"],
  httpStatus: number | null = null,
  retryAfterSeconds: number | null = null,
): PoliceOutcomeResult {
  return policeOutcomeResultSchema.parse({
    expectedCrime,
    fetchedAt,
    sourceUrl: outcomeSourceUrl(expectedCrime.persistentId),
    sourceFamilyId: "police-uk",
    originGroupId: null,
    synthetic: false,
    alertEligible: false,
    containsPersonIdentifiers: false,
    status,
    errorCode,
    httpStatus,
    sourceSnapshotSha256: null,
    outcomes: null,
    lineage: "not_verified",
    retryAfterSeconds,
  });
}
export function createPoliceOutcomeClient(
  options: { fetch?: typeof fetch; now?: () => Date; timeoutMs?: number } = {},
) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = z
    .number()
    .int()
    .min(1)
    .max(OUTCOME_LIMITS.timeoutMs)
    .parse(options.timeoutMs ?? OUTCOME_LIMITS.timeoutMs);
  return async (expectedInput: unknown): Promise<PoliceOutcomeResult> => {
    const expectedCrime = expectedCrimeSchema.parse(expectedInput),
      fetchedAt = now().toISOString();
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let httpStatus: number | null = null;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        void reader?.cancel().catch(() => {});
        reject(new OutcomeError("timeout"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        deadline,
        (async () => {
          const response = await fetchImpl(
            outcomeSourceUrl(expectedCrime.persistentId),
            {
              redirect: "error",
              signal: controller.signal,
              headers: { Accept: "application/json" },
            },
          );
          httpStatus = response.status;
          if (
            response.redirected ||
            (response.status >= 300 && response.status < 400)
          ) {
            void response.body?.cancel().catch(() => {});
            return failure(
              expectedCrime,
              fetchedAt,
              "unavailable",
              "redirect_rejected",
              httpStatus,
            );
          }
          if (response.status === 429) {
            const header = response.headers.get("retry-after");
            const seconds = header
              ? /^\d+$/.test(header)
                ? Number(header)
                : Math.ceil((Date.parse(header) - now().getTime()) / 1000)
              : NaN;
            void response.body?.cancel().catch(() => {});
            return failure(
              expectedCrime,
              fetchedAt,
              "rate_limited",
              "rate_limited",
              429,
              Number.isFinite(seconds)
                ? Math.min(86400, Math.max(0, seconds))
                : null,
            );
          }
          if (response.status !== 200) {
            void response.body?.cancel().catch(() => {});
            return failure(
              expectedCrime,
              fetchedAt,
              response.status === 404 ? "not_available" : "unavailable",
              response.status === 404 ? "not_found" : "http_error",
              httpStatus,
            );
          }
          if (!response.body) throw new OutcomeError("invalid_response");
          const contentLength = response.headers.get("content-length");
          if (
            contentLength &&
            Number(contentLength) > OUTCOME_LIMITS.maxBytes
          ) {
            void response.body.cancel().catch(() => {});
            throw new OutcomeError("response_too_large");
          }
          reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > OUTCOME_LIMITS.maxBytes)
              throw new OutcomeError("response_too_large");
            chunks.push(part.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          return await normalizePoliceOutcomes(bytes, expectedCrime, fetchedAt);
        })(),
      ]);
    } catch (error) {
      return failure(
        expectedCrime,
        fetchedAt,
        "unavailable",
        error instanceof OutcomeError ? error.code : "network_failure",
        httpStatus,
      );
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  };
}
export async function collectPoliceOutcomes(
  expectedInput: unknown,
  client = createPoliceOutcomeClient(),
  now = () => new Date(),
): Promise<PoliceOutcomeCollection> {
  const expected = z
    .array(expectedCrimeSchema)
    .min(1)
    .max(OUTCOME_LIMITS.maxCrimes)
    .parse(expectedInput);
  if (
    new Set(expected.map((row) => row.persistentId)).size !== expected.length ||
    new Set(expected.map((row) => row.exampleId)).size !== expected.length
  )
    throw new Error("Duplicate requested crime identity.");
  const results: PoliceOutcomeResult[] = [];
  let rateLimited = false;
  for (const row of expected) {
    const result = rateLimited
      ? failure(row, now().toISOString(), "not_attempted", "rate_limit_halt")
      : policeOutcomeResultSchema.parse(await client(row));
    results.push(result);
    if (result.status === "rate_limited") rateLimited = true;
  }
  return policeOutcomeCollectionSchema.parse({
    schemaVersion: "1.0",
    methodVersion: "police-outcomes/1",
    collectedAt: now().toISOString(),
    sourceDocumentation:
      "https://data.police.uk/docs/method/outcomes-for-crime/",
    sourceFamilyId: "police-uk",
    synthetic: false,
    results,
    limitations: [
      "Exact persistent ID links public outcome history to the selected police record. It is not a police case reference.",
      "Outcome dates have month precision. Source order cannot establish the sequence of events within one month.",
      "Repeated outcome rows are retained. They do not establish the number of people involved.",
      "No person identifiers, identity nodes, incident narratives or exact event times are retained.",
      "Unavailable history remains unknown. An empty published history does not establish that no action occurred.",
      "Police.uk history shares the police source family. It is not independent corroboration of a community report.",
      "A published outcome does not identify the offence subtype or disclose the evidence collected.",
      "Source response hashes include original bytes. Only the redacted, normalized fields are persisted.",
    ],
  });
}
