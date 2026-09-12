import { z } from "zod";
import {
  areas,
  pilotSchema,
  type PilotId,
  type Persona,
} from "../contracts/index.js";

export const CONSENT_VERSION = "research-demo-v1" as const;
export const MAX_OBSERVATIONS = 100;
export const researchPolicy = {
  version: CONSENT_VERSION,
  purpose: "Test fictional community research and aggregate coverage.",
  retentionHours: 24,
  withdrawal: "Withdrawal removes answers and excludes them from coverage.",
  fictional: true,
} as const;
export const comfortFactors = [
  "lighting",
  "visibility",
  "crowding",
  "access",
  "wayfinding",
  "help_presence",
] as const;
export const behaviors = [
  "continued",
  "paused",
  "changed_plan",
  "sought_help",
  "prefer_not_to_say",
] as const;
export const timeWindows = [
  "morning",
  "daytime",
  "evening",
  "overnight",
] as const;
export const landmarkOptions: Record<
  PilotId,
  readonly { id: string; label: string }[]
> = {
  hounslow_town_centre: [
    { id: "hounslow_high_street", label: "High Street area" },
    { id: "hounslow_bell_square", label: "Bell Square area" },
  ],
  camden_town: [
    { id: "camden_high_street", label: "Camden High Street area" },
    { id: "camden_parkway", label: "Parkway area" },
  ],
  west_croydon: [
    { id: "croydon_interchange", label: "West Croydon interchange area" },
    { id: "croydon_london_road", label: "London Road approach" },
  ],
};
const timestamp = z.string().datetime({ offset: true });
const boundedId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const observationInputSchema = z
  .object({
    pilotId: pilotSchema,
    landmarkId: z.string().max(50),
    recruitmentEntryId: z.string().max(80),
    observedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (value) =>
          !Number.isNaN(Date.parse(value)) &&
          new Date(value).toISOString().slice(0, 10) === value,
        "Select a valid date.",
      ),
    comfortFactors: z
      .array(z.enum(comfortFactors))
      .min(1)
      .max(6)
      .refine(
        (values) => new Set(values).size === values.length,
        "Select each factor once.",
      ),
    behavior: z.enum(behaviors),
    timeWindow: z.enum(timeWindows),
    fictional: z.literal(true),
    consent: z
      .object({
        version: z.literal(CONSENT_VERSION),
        participation: z.literal(true),
        aggregate: z.boolean(),
      })
      .strict(),
    idempotencyKey: boundedId,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      !directoryEntries.some(
        (entry) =>
          entry.id === value.recruitmentEntryId &&
          entry.pilotId === value.pilotId,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recruitmentEntryId"],
        message: "Select a network in this pilot area.",
      });
    }
    if (
      !landmarkOptions[value.pilotId].some(
        (item) => item.id === value.landmarkId,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["landmarkId"],
        message: "Select a landmark in this pilot area.",
      });
    }
  });
export type ResearchObservationInput = z.infer<typeof observationInputSchema>;
export interface ActiveObservation {
  id: string;
  owner: Persona;
  revision: number;
  status: "active";
  fictional: true;
  pilotId: PilotId;
  landmarkId: string;
  recruitmentEntryId: string;
  observedDate: string;
  comfortFactors: ResearchObservationInput["comfortFactors"];
  behavior: ResearchObservationInput["behavior"];
  timeWindow: ResearchObservationInput["timeWindow"];
  consent: ResearchObservationInput["consent"];
  consentedAt: string;
  createdAt: string;
  expiresAt: string;
  purpose: typeof researchPolicy.purpose;
  provenance: {
    sourceKind: "fictional_firsthand";
    sourceFamily: "research-demo";
    originId: string;
    recruitmentEntryId: string;
    collectionMethod: "structured_demo_form";
  };
}
export interface WithdrawnObservation {
  id: string;
  owner: Persona;
  revision: number;
  status: "withdrawn";
  fictional: true;
  withdrawnAt: string;
}
export type ResearchObservation = ActiveObservation | WithdrawnObservation;
export interface RecruitmentState {
  observations: ResearchObservation[];
  // References only. A replay cannot contain or restore withdrawn content.
  submissions: { owner: Persona; key: string; observationId: string }[];
}
export interface PublicDirectoryEntry {
  id: string;
  pilotId: PilotId;
  label: string;
  locality: string;
  eligibility: string;
  accessKind: "join" | "request" | "channel" | "legacy" | "gateway";
  accessStatus: "demo_only";
  permissionStatus: "not_requested";
  fictional: true;
  checkedAt: string;
  expiresAt: string;
  provenance: {
    sourceKind: "fictional_fixture";
    sourceFamily: "research-demo";
  };
}
export const directoryEntries: readonly PublicDirectoryEntry[] = areas.flatMap(
  (area) =>
    (["join", "request", "channel", "legacy", "gateway"] as const).map(
      (accessKind) => ({
        id: `${area.id}_${accessKind}`,
        pilotId: area.id,
        label: `Fictional ${area.shortName} ${accessKind} network`,
        locality: area.name,
        eligibility: "Fictional local participants only",
        accessKind,
        accessStatus: "demo_only" as const,
        permissionStatus: "not_requested" as const,
        fictional: true as const,
        checkedAt: "2026-09-12T00:00:00.000Z",
        expiresAt: "2026-10-12T00:00:00.000Z",
        provenance: {
          sourceKind: "fictional_fixture" as const,
          sourceFamily: "research-demo" as const,
        },
      }),
    ),
);
export function listRecruitmentDirectory(pilotId: PilotId, now: string) {
  pilotSchema.parse(pilotId);
  timestamp.parse(now);
  return directoryEntries
    .filter((entry) => entry.pilotId === pilotId)
    .map((entry) => ({
      ...structuredClone(entry),
      freshness:
        Date.parse(now) < Date.parse(entry.checkedAt)
          ? ("unconfirmed" as const)
          : Date.parse(now) >= Date.parse(entry.expiresAt)
            ? ("expired" as const)
            : ("current_fixture" as const),
    }));
}
export class RecruitmentError extends Error {
  constructor(
    public readonly code: "forbidden" | "not_found" | "conflict" | "capacity",
    message: string,
  ) {
    super(message);
    this.name = "RecruitmentError";
  }
}
function member(actor: Persona) {
  if (actor !== "alex" && actor !== "sam")
    throw new RecruitmentError("forbidden", "Select a fictional member.");
}
export function createRecruitmentDemo(): RecruitmentState {
  return { observations: [], submissions: [] };
}
export function observationsForOwner(
  state: RecruitmentState,
  actor: Persona,
): ResearchObservation[] {
  member(actor);
  return structuredClone(
    state.observations.filter((item) => item.owner === actor),
  );
}
export function submitResearchObservation(
  state: RecruitmentState,
  actor: Persona,
  input: unknown,
  context: { id: string; now: string },
): RecruitmentState {
  member(actor);
  const parsed = observationInputSchema.parse(input);
  boundedId.parse(context.id);
  timestamp.parse(context.now);
  if (parsed.observedDate > context.now.slice(0, 10))
    throw new RecruitmentError(
      "conflict",
      "The observation date cannot be in the future.",
    );
  const replay = state.submissions.find(
    (item) => item.owner === actor && item.key === parsed.idempotencyKey,
  );
  if (replay) {
    const existing = state.observations.find(
      (item) => item.id === replay.observationId && item.owner === actor,
    );
    if (!existing || existing.status === "withdrawn")
      throw new RecruitmentError("conflict", "This submission was withdrawn.");
    const { idempotencyKey: _key, ...submitted } = parsed;
    const original = {
      pilotId: existing.pilotId,
      landmarkId: existing.landmarkId,
      recruitmentEntryId: existing.recruitmentEntryId,
      observedDate: existing.observedDate,
      comfortFactors: existing.comfortFactors,
      behavior: existing.behavior,
      timeWindow: existing.timeWindow,
      fictional: existing.fictional,
      consent: existing.consent,
    };
    if (JSON.stringify(submitted) !== JSON.stringify(original))
      throw new RecruitmentError(
        "conflict",
        "This submission key has different answers.",
      );
    return structuredClone(state);
  }
  if (state.observations.some((item) => item.id === context.id))
    throw new RecruitmentError(
      "conflict",
      "This identifier is already in use.",
    );
  if (
    state.observations.length >= MAX_OBSERVATIONS ||
    state.submissions.length >= MAX_OBSERVATIONS
  )
    throw new RecruitmentError(
      "capacity",
      "This demonstration has reached its submission limit.",
    );
  const { idempotencyKey, ...answers } = parsed;
  return {
    observations: [
      ...structuredClone(state.observations),
      {
        ...answers,
        id: context.id,
        owner: actor,
        revision: 1,
        status: "active",
        consentedAt: context.now,
        createdAt: context.now,
        expiresAt: new Date(
          Date.parse(context.now) + researchPolicy.retentionHours * 3600000,
        ).toISOString(),
        purpose: researchPolicy.purpose,
        provenance: {
          sourceKind: "fictional_firsthand",
          sourceFamily: "research-demo",
          originId: context.id,
          recruitmentEntryId: parsed.recruitmentEntryId,
          collectionMethod: "structured_demo_form",
        },
      },
    ],
    submissions: [
      ...structuredClone(state.submissions),
      { owner: actor, key: idempotencyKey, observationId: context.id },
    ],
  };
}
export const withdrawalInputSchema = z
  .object({ id: boundedId, expectedRevision: z.number().int().positive() })
  .strict();
export function withdrawResearchObservation(
  state: RecruitmentState,
  actor: Persona,
  input: unknown,
  now: string,
): RecruitmentState {
  member(actor);
  timestamp.parse(now);
  const parsed = withdrawalInputSchema.parse(input);
  const existing = state.observations.find(
    (item) => item.id === parsed.id && item.owner === actor,
  );
  if (!existing)
    throw new RecruitmentError("not_found", "This observation was not found.");
  if (
    existing.revision !== parsed.expectedRevision ||
    existing.status === "withdrawn"
  )
    throw new RecruitmentError("conflict", "This observation has changed.");
  const result = structuredClone(state);
  result.observations = result.observations.map((item) =>
    item.id === existing.id
      ? {
          id: existing.id,
          owner: actor,
          revision: existing.revision + 1,
          status: "withdrawn",
          fictional: true,
          withdrawnAt: now,
        }
      : item,
  );
  return result;
}
export interface CoverageComparison {
  pilotId: PilotId;
  fictional: true;
  count: number | null;
  coverage: "suppressed" | "available";
  comparisonStatus: "insufficient_comparable_data";
  explanation: string;
}
export function compareResearchCoverage(
  state: RecruitmentState,
  now: string,
): CoverageComparison[] {
  timestamp.parse(now);
  return areas.map((area) => {
    const count = state.observations.filter(
      (item) =>
        item.status === "active" &&
        item.pilotId === area.id &&
        item.consent.participation &&
        item.consent.aggregate &&
        item.consent.version === CONSENT_VERSION &&
        Date.parse(item.createdAt) <= Date.parse(now) &&
        Date.parse(item.expiresAt) > Date.parse(now),
    ).length;
    return {
      pilotId: area.id,
      fictional: true,
      count: count >= 3 ? count : null,
      coverage: count >= 3 ? "available" : "suppressed",
      comparisonStatus: "insufficient_comparable_data",
      explanation:
        "Fictional voluntary submissions do not establish representative coverage or comparable local conditions.",
    };
  });
}

export function expireResearchObservations(
  state: RecruitmentState,
  now: string,
): RecruitmentState {
  timestamp.parse(now);
  let result = structuredClone(state);
  for (const item of result.observations) {
    if (
      item.status === "active" &&
      Date.parse(item.expiresAt) <= Date.parse(now)
    ) {
      result = withdrawResearchObservation(
        result,
        item.owner,
        { id: item.id, expectedRevision: item.revision },
        now,
      );
    }
  }
  return result;
}

export const researchObservationSchema = z.union([
  observationInputSchema
    .innerType()
    .omit({ idempotencyKey: true })
    .extend({
      id: boundedId,
      owner: z.enum(["alex", "sam"]),
      revision: z.number().int().positive(),
      status: z.literal("active"),
      consentedAt: timestamp,
      createdAt: timestamp,
      expiresAt: timestamp,
      purpose: z.literal(researchPolicy.purpose),
      provenance: z
        .object({
          sourceKind: z.literal("fictional_firsthand"),
          sourceFamily: z.literal("research-demo"),
          originId: boundedId,
          recruitmentEntryId: boundedId,
          collectionMethod: z.literal("structured_demo_form"),
        })
        .strict(),
    })
    .strict()
    .superRefine((value, ctx) => {
      const {
        id,
        owner,
        revision,
        status,
        consentedAt,
        createdAt,
        expiresAt,
        purpose,
        provenance,
        ...input
      } = value;
      if (
        !observationInputSchema.safeParse({
          ...input,
          idempotencyKey: "validate",
        }).success ||
        Date.parse(expiresAt) > Date.parse(createdAt) + 86400000 ||
        Date.parse(expiresAt) <= Date.parse(createdAt)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid stored research observation.",
        });
      }
    }),
  z
    .object({
      id: boundedId,
      owner: z.enum(["alex", "sam"]),
      revision: z.number().int().positive(),
      status: z.literal("withdrawn"),
      fictional: z.literal(true),
      withdrawnAt: timestamp,
    })
    .strict(),
]);
export const recruitmentStateSchema = z
  .object({
    observations: z.array(researchObservationSchema).max(MAX_OBSERVATIONS),
    submissions: z
      .array(
        z
          .object({
            owner: z.enum(["alex", "sam"]),
            key: boundedId,
            observationId: boundedId,
          })
          .strict(),
      )
      .max(MAX_OBSERVATIONS),
  })
  .strict();
export const researchSnapshotSchema = z
  .object({
    observations: z.array(researchObservationSchema).max(MAX_OBSERVATIONS),
    coverage: z
      .array(
        z
          .object({
            pilotId: pilotSchema,
            fictional: z.literal(true),
            count: z.number().int().min(3).nullable(),
            coverage: z.enum(["suppressed", "available"]),
            comparisonStatus: z.literal("insufficient_comparable_data"),
            explanation: z.string().max(1000),
          })
          .strict(),
      )
      .length(3),
    policy: z
      .object({
        version: z.literal(CONSENT_VERSION),
        purpose: z.literal(researchPolicy.purpose),
        retentionHours: z.literal(24),
        withdrawal: z.literal(researchPolicy.withdrawal),
        fictional: z.literal(true),
      })
      .strict(),
  })
  .strict();
