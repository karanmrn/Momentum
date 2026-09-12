import { randomUUID } from "node:crypto";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  pilotSchema,
  type Store,
  type DemoState,
} from "../packages/contracts/index.js";
import { DomainError } from "../packages/domain/index.js";
import {
  relationReviewView,
  loadRelationExamples,
  generateCandidates,
  decideCandidate,
  mergeReviewCluster,
  splitReviewCluster,
  undoClusterEvent,
} from "../packages/relation-review/index.js";
import { commandKeySchema } from "../packages/relation-review/schema.js";

/** Mount after verified demo session middleware. Every private read requires the moderator role. */
export function createRelationReviewRoutes(store: Store): Router {
  const router = Router();
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (
      typeof response.locals.sessionId !== "string" ||
      !/^[a-f0-9]{64}$/.test(response.locals.sessionId) ||
      response.locals.persona !== "moderator"
    ) {
      failure(
        response,
        403,
        "unauthorised",
        "This view requires the demonstration moderator.",
      );
      return;
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      const expected = `${process.env.VERCEL ? "https" : request.protocol}://${request.get("host")}`;
      if (
        request.get("sec-fetch-site") === "cross-site" ||
        (request.get("origin") && request.get("origin") !== expected)
      ) {
        failure(
          response,
          403,
          "unauthorised",
          "This request is not permitted.",
        );
        return;
      }
      if (!request.is("application/json")) {
        failure(response, 415, "invalid_input", "Use a JSON request.");
        return;
      }
    }
    next();
  });
  const ok = (response: Response, data: unknown) =>
    response.json({
      schemaVersion: "1.0",
      synthetic: true,
      generatedAt: new Date().toISOString(),
      data,
      coverage: [],
    });
  router.get("/", async (request, response, next) => {
    try {
      const area = pilotSchema.parse(request.query.area);
      ok(
        response,
        relationReviewView(
          await store.read(response.locals.sessionId),
          "moderator",
          area,
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  function mutation(
    path: string,
    operation: (state: DemoState, request: Request, key: string) => unknown,
  ) {
    router.post(path, async (request, response, next) => {
      try {
        const key = commandKeySchema.parse(request.get("Idempotency-Key"));
        const result = await store.mutate(response.locals.sessionId, (state) =>
          operation(state, request, key),
        );
        ok(response, result);
      } catch (error) {
        next(error);
      }
    });
  }
  mutation("/examples", (state, request, key) =>
    loadRelationExamples(state, "moderator", request.body, key),
  );
  mutation("/generate", (state, request, key) =>
    generateCandidates(state, "moderator", request.body, key),
  );
  mutation("/candidates/:id/decision", (state, request, key) =>
    decideCandidate(
      state,
      "moderator",
      String(request.params.id),
      request.body,
      key,
    ),
  );
  mutation("/clusters/merge", (state, request, key) =>
    mergeReviewCluster(state, "moderator", request.body, key),
  );
  mutation("/clusters/:id/split", (state, request, key) =>
    splitReviewCluster(
      state,
      "moderator",
      String(request.params.id),
      request.body,
      key,
    ),
  );
  mutation("/events/:id/undo", (state, request, key) =>
    undoClusterEvent(
      state,
      "moderator",
      String(request.params.id),
      request.body,
      key,
    ),
  );
  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof DomainError) {
        failure(response, error.status, error.code, error.message);
        return;
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        failure(response, 400, "invalid_input", "Request input is invalid.");
        return;
      }
      failure(
        response,
        500,
        "internal_error",
        "This fictional review could not be completed.",
      );
    },
  );
  return router;
}
function failure(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  response
    .status(status)
    .json({
      schemaVersion: "1.0",
      error: { code, message },
      requestId: randomUUID(),
    });
}
