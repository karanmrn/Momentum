import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import type { Persona, Store } from "../packages/contracts/index.js";
import { getDatasetCoverage } from "../packages/datasets/src/coverage.js";
import {
  PersonalizationError,
  currentPersonalNotice,
  readPersonalSettings,
  savePersonalSettings,
  resetPersonalSettings,
  deletePersonalSettings,
  exportPersonalSettings,
  relevantNotices,
  personalInbox,
  queuePersonalUpdates,
  dispatchPersonalUpdates,
  followCatalog,
  followedAreas,
  type PersonalizationHost,
  type Delivery,
  type Contexts,
} from "../packages/personalization/index.js";
const empty = z.object({}).strict();
function actor(request: Request) {
  const session = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .safeParse(request.res?.locals.sessionId);
  const persona = z
    .enum(["alex", "sam"])
    .safeParse(request.res?.locals.persona);
  if (!session.success)
    throw new PersonalizationError(
      401,
      "unauthorised",
      "A demonstration session is required.",
    );
  if (!persona.success)
    throw new PersonalizationError(
      403,
      "forbidden",
      "Choose a member demonstration persona.",
    );
  return { sessionId: session.data, persona: persona.data };
}
export function createPersonalizationRoutes(
  store: Store,
  options: {
    now?: () => Date;
    contexts?: (state: PersonalizationHost) => Contexts;
    deliver?: (item: Readonly<Delivery>) => void | Promise<void>;
  } = {},
) {
  const router = Router(),
    now = options.now ?? (() => new Date());
  const envelope = (data: unknown) => ({
    schemaVersion: "1.0",
    synthetic: true,
    generatedAt: now().toISOString(),
    data,
    coverage: [],
  });
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store");
    try {
      actor(request);
      if (Object.keys(request.query).length)
        throw new PersonalizationError(
          400,
          "invalid_input",
          "Query parameters are not supported.",
        );
      if (
        !["GET", "HEAD"].includes(request.method) &&
        !request.is("application/json")
      )
        throw new PersonalizationError(
          415,
          "invalid_input",
          "Use Content-Type application/json.",
        );
      next();
    } catch (error) {
      next(error);
    }
  });
  function view(state: PersonalizationHost, persona: Persona) {
    const preferences = readPersonalSettings(state, persona);
    const contexts = options.contexts?.(state) ?? {};
    return {
      preferences,
      catalog: followCatalog,
      feed: relevantNotices(state, persona, now(), contexts),
      mutedNotices: preferences.settings.mutedNoticeIds.map((id) => ({
        id,
        title:
          currentPersonalNotice(state, id, now(), contexts)?.title ??
          `Unavailable muted notice ${id.slice(0, 8)}`,
      })),
      inbox: personalInbox(state, persona).map((item) => {
        const current = state.notices.find((n) => n.id === item.noticeId);
        const visible = currentPersonalNotice(
          state,
          item.noticeId,
          now(),
          contexts,
        );
        return {
          ...item,
          currentNotice: visible
            ? { title: visible.title, summary: visible.summary }
            : null,
          currentStatus: current?.status ?? "unavailable",
          currentRevision: current?.revision ?? null,
        };
      }),
      historicalDigest:
        preferences.settings.historicalDigest && !preferences.deleted
          ? followedAreas(preferences.settings).flatMap((pilot) =>
              getDatasetCoverage(pilot)
                .filter((row) => row.sourceKind === "historical_police")
                .map((row) => ({
                  pilotId: pilot,
                  title: row.title,
                  status: row.status,
                  latestMonth: row.latestMonth,
                  months: row.acquiredMonths,
                  sourceUrl: row.sourceUrl,
                  limitations: row.limitations,
                })),
            )
          : [],
      limitations: [
        "This is an isolated fictional session. Real account preferences require separate account storage.",
        "Station IDs come from checked TfL identities. Candidate place and zone boundaries remain unreviewed.",
        "Only exact source place references establish place matches. A common area does not establish station membership.",
        "Language preference orders explicitly tagged content. This interface remains English; no automatic translation is applied.",
        "External push is disabled. Historical coverage never creates a current warning.",
      ],
    };
  }
  router.get("/", async (request, response, next) => {
    try {
      const a = actor(request);
      response.json(envelope(view(await store.read(a.sessionId), a.persona)));
    } catch (e) {
      next(e);
    }
  });
  router.get("/export", async (request, response, next) => {
    try {
      const a = actor(request);
      response
        .set(
          "Content-Disposition",
          'attachment; filename="momentum-preferences.json"',
        )
        .json(
          envelope(
            exportPersonalSettings(await store.read(a.sessionId), a.persona),
          ),
        );
    } catch (e) {
      next(e);
    }
  });
  router.put("/", async (request, response, next) => {
    try {
      const a = actor(request);
      const result = await store.mutate(a.sessionId, (state) => {
        savePersonalSettings(
          state,
          a.persona,
          request.body,
          now(),
          options.contexts?.(state) ?? {},
        );
        return view(state, a.persona);
      });
      response.json(envelope(result));
    } catch (e) {
      next(e);
    }
  });
  for (const action of ["reset", "delete", "queue", "dispatch"] as const)
    router.post(`/${action}`, async (request, response, next) => {
      try {
        const a = actor(request);
        if (action === "queue" || action === "dispatch")
          empty.parse(request.body);
        const result = await store.mutate(a.sessionId, async (state) => {
          if (action === "reset")
            resetPersonalSettings(state, a.persona, request.body);
          if (action === "delete")
            deletePersonalSettings(state, a.persona, request.body);
          if (action === "queue")
            queuePersonalUpdates(
              state,
              a.persona,
              now(),
              options.contexts?.(state) ?? {},
            );
          if (action === "dispatch")
            await dispatchPersonalUpdates(
              state,
              a.persona,
              now(),
              options.contexts?.(state) ?? {},
              options.deliver,
            );
          return view(state, a.persona);
        });
        response.json(envelope(result));
      } catch (e) {
        next(e);
      }
    });
  router.use((_request, response) =>
    response.status(405).json({
      schemaVersion: "1.0",
      error: {
        code: "method_not_allowed",
        message: "This operation is not supported.",
      },
    }),
  );
  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      const status =
        error instanceof PersonalizationError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 503;
      response.status(status).json({
        schemaVersion: "1.0",
        error: {
          code:
            error instanceof PersonalizationError
              ? error.code
              : status === 400
                ? "invalid_input"
                : "unavailable",
          message:
            error instanceof PersonalizationError
              ? error.message
              : status === 400
                ? "Check the preference values."
                : "Preferences are unavailable. Try again.",
        },
      });
    },
  );
  return router;
}
