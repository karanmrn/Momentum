import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pilotSchema, type Store } from "../packages/contracts/index.js";
import {
  analyse,
  empiricalStatus,
  readAnalytics,
  reviewAnalysis,
  syntheticInputs,
} from "../packages/analytics/src/index.js";
import {
  DomainError,
  fingerprint,
  replayOrRecord,
} from "../packages/domain/index.js";
const envelope = <T>(data: T, synthetic = true) => ({
  schemaVersion: "1.0",
  synthetic,
  generatedAt: new Date().toISOString(),
  data,
  coverage: [],
});
const querySchema = z.object({ area: pilotSchema }).strict();
export function createAnalyticsRoutes(store: Store): Router {
  const router = Router();
  router.get("/status", (req, res, next) => {
    try {
      res.json(
        envelope(empiricalStatus(querySchema.parse(req.query).area), false),
      );
    } catch (error) {
      next(error);
    }
  });
  router.use((_req, res, next) => {
    if (res.locals.persona !== "moderator")
      return next(
        new DomainError(
          403,
          "unauthorised",
          "Choose the fictional moderator to inspect research runs.",
        ),
      );
    next();
  });
  const scope = (res: { locals: Record<string, unknown> }, area: string) => {
    if (
      !Array.isArray(res.locals.moderatorAreas) ||
      !res.locals.moderatorAreas.includes(area)
    )
      throw new DomainError(
        403,
        "unauthorised",
        "This area is outside the review scope.",
      );
  };
  router.get("/", async (req, res, next) => {
    try {
      const { area } = querySchema.parse(req.query);
      scope(res, area);
      const state = readAnalytics(await store.read(res.locals.sessionId));
      res.json(
        envelope({
          ...state,
          runs: state.runs.filter((r) => r.question.pilotId === area),
        }),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post("/runs", async (req, res, next) => {
    try {
      const input = z
        .object({
          area: pilotSchema,
          expectedRevision: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
      scope(res, input.area);
      const key = z
        .string()
        .min(8)
        .max(128)
        .parse(req.header("Idempotency-Key"));
      const result = await store.mutate(res.locals.sessionId, (state) =>
        replayOrRecord(state, `analysis:${key}`, fingerprint(input), () => {
          const current = readAnalytics(state);
          if (current.revision !== input.expectedRevision)
            throw new DomainError(
              409,
              "conflict",
              "The analysis changed. Reload before running.",
            );
          if (current.runs.length >= 20)
            throw new DomainError(
              429,
              "rate_limited",
              "This demonstration has reached its analysis limit.",
            );
          const fixture = syntheticInputs(input.area);
          const run = {
            id: randomUUID(),
            ...fixture,
            result: analyse(fixture.question, ...fixture.inputs),
            reviewNote: null,
          };
          current.runs.push(run);
          current.revision++;
          state.analytics = current;
          return run;
        }),
      );
      res.status(201).json(envelope(result));
    } catch (error) {
      next(error);
    }
  });
  router.post("/runs/:id/review", async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const input = z
        .object({
          expectedRevision: z.number().int().positive(),
          decision: z.enum(["approved_demo", "rejected"]),
          note: z.string().trim().min(5).max(300),
        })
        .strict()
        .parse(req.body);
      const result = await store.mutate(res.locals.sessionId, (state) => {
        const run = readAnalytics(state).runs.find((r) => r.id === id);
        if (!run)
          throw new DomainError(
            404,
            "not_found",
            "The analysis was not found.",
          );
        scope(res, run.question.pilotId);
        const reviewed = reviewAnalysis(
          state,
          id,
          input.expectedRevision,
          input.decision,
          input.note,
        );
        return {
          ...reviewed,
          runs: reviewed.runs.filter(
            (row) => row.question.pilotId === run.question.pilotId,
          ),
        };
      });
      res.json(envelope(result));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
