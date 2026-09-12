import { randomUUID } from "node:crypto";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";
import {
  decisionSchema,
  preferencesSchema,
  reportInputSchema,
  type DemoState,
  type Envelope,
  type Persona,
  type Store,
} from "../packages/contracts/index.js";
import {
  DomainError,
  decideReport,
  dispatchNotifications,
  findPublicNotice,
  fingerprint,
  listPublicNotices,
  moderationQueue,
  notificationsFor,
  personalisedFeed,
  publicEvidenceGraph,
  readPreferences,
  replayOrRecord,
  reportsForOwner,
  submitReport,
  updatePreferences,
  withdrawReport,
} from "../packages/domain/index.js";

const idSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(128);
const withdrawalSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    action: z.literal("withdraw"),
  })
  .strict();

export function createRoutes(store: Store): Router {
  const router = Router();
  router.use((_: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/feed", async (request, response, next) => {
    try {
      const area = queryText(request, "area");
      const state = await store.read(actor(request).sessionId);
      response.json(envelope(listPublicNotices(state, area)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/notices/:id", async (request, response, next) => {
    try {
      const state = await store.read(actor(request).sessionId);
      response.json(envelope(findPublicNotice(state, idParam(request))));
    } catch (error) {
      next(error);
    }
  });

  router.get("/notices/:id/evidence", async (request, response, next) => {
    try {
      const state = await store.read(actor(request).sessionId);
      response.json(envelope(publicEvidenceGraph(state, idParam(request))));
    } catch (error) {
      next(error);
    }
  });

  router.get("/reports", async (request, response, next) => {
    try {
      const current = actor(request);
      const state = await store.read(current.sessionId);
      response.json(envelope(reportsForOwner(state, current.persona)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/reports", async (request, response, next) => {
    try {
      const current = actor(request);
      requireJson(request);
      const input = parse(reportInputSchema, request.body);
      const key = idempotencyKey(request);
      const result = await store.mutate(current.sessionId, (state) =>
        replayOrRecord(
          state,
          `report:${current.persona}:${key}`,
          fingerprint(input),
          () => submitReport(state, current.persona, input),
        ),
      );
      response.status(201).json(envelope(result));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/reports/:id", async (request, response, next) => {
    try {
      const current = actor(request);
      requireJson(request);
      const input = parse(withdrawalSchema, request.body);
      const result = await store.mutate(current.sessionId, (state) =>
        withdrawReport(
          state,
          current.persona,
          idParam(request),
          input.expectedRevision,
        ),
      );
      response.json(envelope(result));
    } catch (error) {
      next(error);
    }
  });

  router.get("/moderation", async (request, response, next) => {
    try {
      const current = actor(request);
      const state = await store.read(current.sessionId);
      response.json(
        envelope(
          moderationQueue(state, current.persona, queryText(request, "area")),
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/moderation/:id/decision", async (request, response, next) => {
    try {
      const current = actor(request);
      requireJson(request);
      const input = parse(decisionSchema, request.body);
      const reportId = idParam(request);
      const key = idempotencyKey(request);
      const result = await store.mutate(current.sessionId, (state) =>
        replayOrRecord(
          state,
          `moderation:${current.persona}:${reportId}:${key}`,
          fingerprint(input),
          () => decideReport(state, current.persona, reportId, input),
        ),
      );
      response.json(envelope(result));
    } catch (error) {
      next(error);
    }
  });

  router.get("/preferences", async (request, response, next) => {
    try {
      const current = actor(request);
      const state = await store.read(current.sessionId);
      response.json(envelope(readPreferences(state, current.persona)));
    } catch (error) {
      next(error);
    }
  });

  router.put("/preferences", async (request, response, next) => {
    try {
      const current = actor(request);
      requireJson(request);
      const input = parse(preferencesSchema, request.body);
      const result = await store.mutate(current.sessionId, (state) => {
        const currentPreferences = readPreferences(state, current.persona);
        if (currentPreferences.revision !== input.expectedRevision) {
          throw new DomainError(
            409,
            "conflict",
            "Preferences have changed. Refresh and try again.",
          );
        }
        return updatePreferences(state, current.persona, {
          revision: currentPreferences.revision + 1,
          areas: input.areas,
          categories: input.categories,
          inAppEnabled: input.inAppEnabled,
        });
      });
      response.json(envelope(result));
    } catch (error) {
      next(error);
    }
  });

  router.get("/me/feed", async (request, response, next) => {
    try {
      const current = actor(request);
      const state = await store.read(current.sessionId);
      response.json(envelope(personalisedFeed(state, current.persona)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/me/notifications", async (request, response, next) => {
    try {
      const current = actor(request);
      const state = await store.read(current.sessionId);
      response.json(envelope(notificationsFor(state, current.persona)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/me/notifications/dispatch", async (request, response, next) => {
    try {
      const current = actor(request);
      requireJson(request);
      const result = await store.mutate(current.sessionId, (state) =>
        dispatchNotifications(state, current.persona),
      );
      response.json(envelope(result));
    } catch (error) {
      next(error);
    }
  });

  router.use(
    (error: unknown, request: Request, response: Response, _: NextFunction) => {
      const requestId =
        request.header("X-Request-Id")?.slice(0, 128) || randomUUID();
      if (error instanceof DomainError) {
        response
          .status(error.status)
          .json({
            schemaVersion: "1.0",
            error: { code: error.code, message: error.message },
            requestId,
          });
        return;
      }
      if (error instanceof z.ZodError) {
        response
          .status(400)
          .json({
            schemaVersion: "1.0",
            error: {
              code: "invalid_input",
              message: "Request input is invalid.",
            },
            requestId,
          });
        return;
      }
      response
        .status(500)
        .json({
          schemaVersion: "1.0",
          error: {
            code: "internal_error",
            message:
              "The synthetic demonstration could not complete the request.",
          },
          requestId,
        });
    },
  );
  return router;
}

function actor(request: Request): { sessionId: string; persona: Persona } {
  const locals = request.res?.locals as
    { sessionId?: unknown; persona?: unknown } | undefined;
  if (typeof locals?.sessionId !== "string" || !locals.sessionId.trim()) {
    throw new DomainError(
      401,
      "unauthorised",
      "An isolated demo session is required.",
    );
  }
  const persona = z
    .enum(["alex", "sam", "moderator"])
    .safeParse(locals.persona);
  if (!persona.success)
    throw new DomainError(
      401,
      "unauthorised",
      "An isolated demo session is required.",
    );
  return { sessionId: locals.sessionId, persona: persona.data };
}

function queryText(request: Request, key: string): string {
  const value = request.query[key];
  if (typeof value !== "string")
    throw new DomainError(
      400,
      "invalid_input",
      `A valid ${key} query is required.`,
    );
  return value;
}

function idParam(request: Request): string {
  return parse(idSchema, request.params.id);
}

function idempotencyKey(request: Request): string {
  const key = request.header("Idempotency-Key");
  if (!key)
    throw new DomainError(400, "invalid_input", "Idempotency-Key is required.");
  return parse(idempotencyKeySchema, key);
}

function requireJson(request: Request): void {
  if (!request.is("application/json")) {
    throw new DomainError(
      400,
      "invalid_input",
      "Content-Type application/json is required.",
    );
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw result.error;
  return result.data;
}

function envelope<T>(data: T): Envelope<T> {
  return {
    schemaVersion: "1.0",
    synthetic: true,
    generatedAt: new Date().toISOString(),
    data,
    coverage: [],
  };
}
