import { Router, json, type RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import flags from "../config/feature_flags.json" with { type: "json" };
import { createPrivateAccountStore } from "./private-accounts-store.js";
import {
  privateReportInputSchema,
  followInputSchema,
  PrivateAccountError,
} from "./private-accounts-contract.js";

type Store = Awaited<ReturnType<typeof createPrivateAccountStore>>;
export function createPrivateAccountRoutes(
  auth: RequestHandler,
  supplied?: () => Promise<Store>,
) {
  const router = Router();
  let pending: Promise<Store> | undefined;
  const store =
    supplied ??
    (() => {
      if (!process.env.ACCOUNT_DATABASE_URL)
        throw new PrivateAccountError(
          503,
          "storage_unavailable",
          "Account storage is not configured.",
        );
      return (pending ??= createPrivateAccountStore({
        connectionString: process.env.ACCOUNT_DATABASE_URL,
      }).catch((error) => {
        pending = undefined;
        throw error;
      }));
    });
  const limits = new Map<string, { count: number; until: number }>();
  const fail = (
    res: Parameters<RequestHandler>[1],
    status: number,
    code: string,
    message: string,
  ) =>
    res
      .status(status)
      .json({
        schemaVersion: "1.0",
        error: { code, message },
        requestId: randomUUID(),
      });
  router.use(auth);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!z.string().uuid().safeParse(res.locals.account?.id).success) {
      fail(res, 401, "unauthorised", "Sign in to continue.");
      return;
    }
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin &&
          req.headers.origin !==
            `${process.env.VERCEL ? "https" : req.protocol}://${req.get("host")}`))
    ) {
      fail(res, 403, "unauthorised", "This request is not permitted.");
      return;
    }
    const now = Date.now();
    for (const [id, limit] of limits) if (limit.until <= now) limits.delete(id);
    const id: string = res.locals.account.id;
    let limit = limits.get(id);
    if (!limit) {
      if (limits.size >= 5000) {
        fail(res, 503, "capacity_unavailable", "Please try again later.");
        return;
      }
      limit = { count: 0, until: now + 60000 };
      limits.set(id, limit);
    }
    if (++limit.count > 100) {
      res.set("Retry-After", "60");
      fail(res, 429, "rate_limited", "Please wait before trying again.");
      return;
    }
    next();
  });
  router.use(json({ limit: "8kb" }));
  const run =
    (
      action: (
        db: Store,
        owner: string,
        req: Parameters<RequestHandler>[0],
      ) => Promise<unknown>,
    ): RequestHandler =>
    async (req, res) => {
      try {
        const data = await action(await store(), res.locals.account.id, req);
        res.json({
          schemaVersion: "1.0",
          synthetic: false,
          generatedAt: new Date().toISOString(),
          data,
          coverage: [],
        });
      } catch (error) {
        if (error instanceof z.ZodError)
          fail(res, 400, "invalid_input", "Check the submitted fields.");
        else if (error instanceof PrivateAccountError)
          fail(res, error.status, error.code, error.message);
        else
          fail(res, 503, "storage_unavailable", "Account data is unavailable.");
      }
    };
  router.get(
    "/reports",
    run((db, id) => db.reports(id)),
  );
  router.post(
    "/reports",
    (req, res, next) => {
      if (!flags.PUBLIC_COMMUNITY_INTAKE) {
        fail(res, 403, "intake_closed", "Public reporting is not open.");
        return;
      }
      next();
    },
    run((db, id, req) =>
      db.report(id, privateReportInputSchema.parse(req.body)),
    ),
  );
  router.get(
    "/follows",
    run((db, id) => db.follows(id)),
  );
  router.put(
    "/follows",
    run((db, id, req) => db.setFollows(id, followInputSchema.parse(req.body))),
  );
  router.get(
    "/inbox",
    run((db, id) => db.inbox(id)),
  );
  router.patch(
    "/inbox/:id",
    run((db, id, req) => {
      z.object({ read: z.literal(true) })
        .strict()
        .parse(req.body);
      return db.markRead(id, z.string().uuid().parse(req.params.id));
    }),
  );
  router.get(
    "/scopes",
    run((db, id) => db.scopes(id)),
  );
  router.get(
    "/export",
    run((db, id) => db.exportData(id)),
  );
  router.delete(
    "/",
    run((db, id, req) => {
      z.object({ confirmation: z.literal("DELETE MY ACCOUNT DATA") })
        .strict()
        .parse(req.body);
      return db.deleteData(id);
    }),
  );
  router.use((_req, res) => {
    fail(res, 404, "not_found", "This account operation is unavailable.");
  });
  router.use(((error, _req, res, _next) => {
    fail(
      res,
      error?.type === "entity.too.large" ? 413 : 400,
      "invalid_input",
      "Check the submitted fields.",
    );
  }) as import("express").ErrorRequestHandler);
  return router;
}
