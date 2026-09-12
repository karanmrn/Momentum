import { z } from "zod";
import type { DemoRevision, ExampleId } from "./index.js";

export const camdenExampleIds = [
  "CAM-01",
  "CAM-02",
  "CAM-03",
  "CAM-04",
  "CAM-05",
] as const;
const revisionState = z.enum(["original", "corrected", "withdrawn"]);
export const camdenStudySchema = z
  .object({
    revision: z.number().int().positive(),
    examples: z
      .object({
        "CAM-01": revisionState,
        "CAM-02": revisionState,
        "CAM-03": revisionState,
        "CAM-04": revisionState,
        "CAM-05": revisionState,
      })
      .strict(),
  })
  .strict();
export type CamdenStudy = z.infer<typeof camdenStudySchema>;
export const camdenStudyActionSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    state: revisionState,
  })
  .strict();
export function defaultCamdenStudy(): CamdenStudy {
  return {
    revision: 1,
    examples: {
      "CAM-01": "original",
      "CAM-02": "original",
      "CAM-03": "original",
      "CAM-04": "original",
      "CAM-05": "original",
    },
  };
}
export function readCamdenStudy<T extends object>(
  state: T & { camdenStudy?: unknown },
): CamdenStudy {
  return state.camdenStudy === undefined
    ? defaultCamdenStudy()
    : camdenStudySchema.parse(state.camdenStudy);
}
export class CamdenStudyConflict extends Error {
  readonly status = 409;
  readonly code = "conflict";
  constructor() {
    super("This study changed. Refresh and try again.");
  }
}
export function updateCamdenStudy<T extends object>(
  state: T & { camdenStudy?: unknown },
  example: ExampleId,
  input: unknown,
): CamdenStudy {
  const id = z.enum(camdenExampleIds).parse(example);
  const action = camdenStudyActionSchema.parse(input);
  const current = readCamdenStudy(state);
  if (current.revision !== action.expectedRevision)
    throw new CamdenStudyConflict();
  const next = camdenStudySchema.parse({
    revision: current.revision + 1,
    examples: { ...current.examples, [id]: action.state as DemoRevision },
  });
  state.camdenStudy = next;
  return structuredClone(next);
}
