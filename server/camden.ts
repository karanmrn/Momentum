import { Router } from "express";
import { z } from "zod";
import {
  reportInputSchema,
  type Envelope,
  type Store,
} from "../packages/contracts/index.js";
import { fictionalScenarios } from "../packages/camden-evidence/index.js";
import {
  readCamdenStudy,
  updateCamdenStudy,
} from "../packages/camden-evidence/session.js";
import {
  DomainError,
  fingerprint,
  replayOrRecord,
  submitReport,
} from "../packages/domain/index.js";

const exampleSchema = z.enum([
  "CAM-01",
  "CAM-02",
  "CAM-03",
  "CAM-04",
  "CAM-05",
]);
const reportRequestSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
const keySchema = z.string().trim().min(8).max(128);
const envelope = <T>(data: T): Envelope<T> => ({
  schemaVersion: "1.0",
  synthetic: true,
  generatedAt: new Date().toISOString(),
  data,
  coverage: [],
});

/** Fictional study actions use the same isolated transaction as community reports. */
export function createCamdenRoutes(store: Store): Router {
  const router = Router();
  router.get("/", async (_request, response, next) => {
    try {
      response.json(
        envelope(readCamdenStudy(await store.read(response.locals.sessionId))),
      );
    } catch (error) {
      next(error);
    }
  });
  router.patch("/:example", async (request, response, next) => {
    try {
      const example = exampleSchema.parse(request.params.example);
      const result = await store.mutate(response.locals.sessionId, (state) => {
        try {
          return updateCamdenStudy(state, example, request.body);
        } catch (error) {
          if (
            error instanceof Error &&
            "status" in error &&
            error.status === 409
          )
            throw new DomainError(
              409,
              "conflict",
              "This example changed. Reload it before trying again.",
            );
          throw error;
        }
      });
      response.json(envelope(result));
    } catch (error) {
      next(error);
    }
  });
  router.post("/:example/report", async (request, response, next) => {
    try {
      const example = exampleSchema.parse(request.params.example);
      const input = reportRequestSchema.parse(request.body);
      const key = keySchema.parse(request.header("Idempotency-Key"));
      const persona = z
        .enum(["alex", "sam"])
        .safeParse(response.locals.persona);
      if (!persona.success)
        throw new DomainError(
          400,
          "invalid_input",
          "Choose Alex or Sam to try a fictional report.",
        );
      const result = await store.mutate(response.locals.sessionId, (state) =>
        replayOrRecord(
          state,
          `report:camden:${persona.data}:${key}`,
          fingerprint({ example, ...input }),
          () => {
            const study = readCamdenStudy(state);
            if (study.revision !== input.expectedRevision)
              throw new DomainError(
                409,
                "conflict",
                "This example changed. Reload it before reporting.",
              );
            if (study.examples[example] === "withdrawn")
              throw new DomainError(
                409,
                "conflict",
                "Reset the withdrawn example before reporting.",
              );
            const scenario = fictionalScenarios.find(
              (item) => item.id === `fictional:${example}`,
            )!;
            const corrected = study.examples[example] === "corrected";
            return submitReport(
              state,
              persona.data,
              reportInputSchema.parse({
                pilotId: "camden_town",
                category: example === "CAM-05" ? "infrastructure" : "community",
                title: `Fictional ${example}: ${scenario.title}`,
                description: `Fictional exercise. ${scenario.account}${corrected ? ` ${scenario.correction}` : ""}`,
                place: "Camden Town research area, approximate place",
                observedAt: corrected
                  ? scenario.correctedObservedAt
                  : scenario.observedAt,
                synthetic: true,
              }),
            );
          },
        ),
      );
      response.status(201).json(envelope(result));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
