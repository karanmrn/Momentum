import { randomUUID } from "node:crypto";
import { Router } from "express";
import { ZodError } from "zod";
import type { Store, DemoState, Persona } from "../packages/contracts/index.js";
import {
  createRecruitmentDemo,
  observationsForOwner,
  compareResearchCoverage,
  submitResearchObservation,
  withdrawResearchObservation,
  expireResearchObservations,
  researchPolicy,
  RecruitmentError,
  recruitmentStateSchema,
  type RecruitmentState,
} from "../packages/recruitment/index.js";

export const readResearchConsent = (state: DemoState): RecruitmentState =>
  recruitmentStateSchema.parse(
    state.researchConsent ?? createRecruitmentDemo(),
  );

export function createResearchConsentRoutes(
  store: Store,
  clock = () => new Date().toISOString(),
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    if (
      typeof res.locals.sessionId !== "string" ||
      !/^[a-f0-9]{64}$/.test(res.locals.sessionId)
    ) {
      res
        .status(401)
        .json({ error: { message: "A demonstration session is required." } });
      return;
    }
    if (!["alex", "sam"].includes(res.locals.persona)) {
      res
        .status(403)
        .json({ error: { message: "Select a fictional member." } });
      return;
    }
    next();
  });
  const snapshot = (state: RecruitmentState, actor: Persona, now: string) => ({
    schemaVersion: "1.0",
    synthetic: true,
    generatedAt: now,
    data: {
      observations: observationsForOwner(state, actor),
      coverage: compareResearchCoverage(state, now),
      policy: researchPolicy,
    },
    coverage: [],
  });
  const handle =
    (operation: "read" | "submit" | "withdraw") =>
    async (req: import("express").Request, res: import("express").Response) => {
      try {
        const now = clock();
        const result = await store.mutate(res.locals.sessionId, (host) => {
          let current = expireResearchObservations(
            readResearchConsent(host),
            now,
          );
          if (operation === "submit")
            current = submitResearchObservation(
              current,
              res.locals.persona,
              req.body,
              { id: randomUUID(), now },
            );
          if (operation === "withdraw")
            current = withdrawResearchObservation(
              current,
              res.locals.persona,
              req.body,
              now,
            );
          host.researchConsent = current;
          return snapshot(current, res.locals.persona, now);
        });
        res.json(result);
      } catch (error) {
        const status =
          error instanceof ZodError
            ? 400
            : error instanceof RecruitmentError
              ? (
                  {
                    forbidden: 403,
                    not_found: 404,
                    conflict: 409,
                    capacity: 429,
                  } as const
                )[error.code]
              : 503;
        res.status(status).json({
          error: {
            message:
              error instanceof RecruitmentError
                ? error.message
                : status === 400
                  ? "Check the fictional observation fields."
                  : "Research storage is unavailable. Try again.",
          },
        });
      }
    };
  router.get("/", handle("read"));
  router.post("/observations", handle("submit"));
  router.post("/withdraw", handle("withdraw"));
  return router;
}
