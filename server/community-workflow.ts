import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  personaSchema,
  pilotSchema,
  type Store,
  type Envelope,
} from "../packages/contracts/index.js";
import { DomainError } from "../packages/domain/index.js";
import {
  createWorkflow,
  listWorkflow,
  ownerWorkflowAction,
  reviewWorkflow,
  publicWorkflow,
  submitDiscussion,
  reviewDiscussion,
  withdrawDiscussion,
  listDiscussions,
  noticeShare,
  type WorkflowActor,
} from "../packages/community-workflow/index.js";
const id = z.string().uuid();
const version = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
const key = z.string().trim().min(8).max(128);
const envelope = <T>(data: T): Envelope<T> => ({
  schemaVersion: "1.0",
  synthetic: true,
  generatedAt: new Date().toISOString(),
  data,
  coverage: [],
});
export function createCommunityWorkflowRoutes(store: Store): Router {
  const router = Router();
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (
      typeof response.locals.sessionId !== "string" ||
      !response.locals.sessionId
    )
      return next(
        new DomainError(
          401,
          "unauthorised",
          "A fictional demonstration session is required.",
        ),
      );
    if (
      ["POST", "PATCH"].includes(request.method) &&
      !request.is("application/json")
    )
      return next(
        new DomainError(415, "invalid_input", "Send this action as JSON."),
      );
    next();
  });
  function actor(response: Response): WorkflowActor {
    return {
      persona: personaSchema.parse(response.locals.persona),
      moderatorAreas: z
        .array(pilotSchema)
        .max(3)
        .parse(response.locals.moderatorAreas ?? []),
    };
  }
  const area = (request: Request) => pilotSchema.parse(request.query.area);
  const requestKey = (request: Request) =>
    key.parse(request.header("Idempotency-Key"));
  type Handler = (request: Request, response: Response) => Promise<void>;
  const safe =
    (handler: Handler) =>
    (request: Request, response: Response, next: NextFunction) => {
      void handler(request, response).catch(next);
    };
  router.get(
    "/",
    safe(async (request, response) => {
      const current = actor(response);
      const pilot = area(request);
      const state = await store.read(response.locals.sessionId);
      response.json(
        envelope({
          reports: listWorkflow(state, current, pilot),
          discussion: listDiscussions(state, current, pilot),
          published: publicWorkflow(state, pilot),
        }),
      );
    }),
  );
  router.post(
    "/reports",
    safe(async (request, response) => {
      const current = actor(response);
      const token = requestKey(request);
      response
        .status(201)
        .json(
          envelope(
            await store.mutate(response.locals.sessionId, (state) =>
              createWorkflow(state, current, request.body, token),
            ),
          ),
        );
    }),
  );
  router.patch(
    "/reports/:id",
    safe(async (request, response) => {
      const current = actor(response);
      const report = id.parse(request.params.id);
      const token = requestKey(request);
      response.json(
        envelope(
          await store.mutate(response.locals.sessionId, (state) =>
            ownerWorkflowAction(state, current, report, request.body, token),
          ),
        ),
      );
    }),
  );
  router.post(
    "/reports/:id/review",
    safe(async (request, response) => {
      const current = actor(response);
      const report = id.parse(request.params.id);
      const token = requestKey(request);
      response.json(
        envelope(
          await store.mutate(response.locals.sessionId, (state) =>
            reviewWorkflow(state, current, report, request.body, token),
          ),
        ),
      );
    }),
  );
  router.post(
    "/notices/:id/discussion",
    safe(async (request, response) => {
      const current = actor(response);
      const notice = id.parse(request.params.id);
      const token = requestKey(request);
      response
        .status(201)
        .json(
          envelope(
            await store.mutate(response.locals.sessionId, (state) =>
              submitDiscussion(state, current, notice, request.body, token),
            ),
          ),
        );
    }),
  );
  router.post(
    "/discussion/:id/review",
    safe(async (request, response) => {
      const current = actor(response);
      const discussion = id.parse(request.params.id);
      const token = requestKey(request);
      response.json(
        envelope(
          await store.mutate(response.locals.sessionId, (state) =>
            reviewDiscussion(state, current, discussion, request.body, token),
          ),
        ),
      );
    }),
  );
  router.patch(
    "/discussion/:id",
    safe(async (request, response) => {
      const current = actor(response);
      const discussion = id.parse(request.params.id);
      const token = requestKey(request);
      const input = version.parse(request.body);
      response.json(
        envelope(
          await store.mutate(response.locals.sessionId, (state) =>
            withdrawDiscussion(
              state,
              current,
              discussion,
              input.expectedRevision,
              token,
            ),
          ),
        ),
      );
    }),
  );
  router.post(
    "/notices/:id/share",
    safe(async (request, response) => {
      const notice = id.parse(request.params.id);
      const input = version.parse(request.body);
      actor(response);
      response.json(
        envelope(
          noticeShare(
            await store.read(response.locals.sessionId),
            notice,
            input.expectedRevision,
          ),
        ),
      );
    }),
  );
  router.get(
    "/notices/:id",
    safe(async (request, response) => {
      const notice = id.parse(request.params.id);
      actor(response);
      response.json(
        envelope(
          noticeShare(await store.read(response.locals.sessionId), notice),
        ),
      );
    }),
  );
  router.use((_request, _response, next) =>
    next(
      new DomainError(
        404,
        "not_found",
        "This community action is not available.",
      ),
    ),
  );
  return router;
}
