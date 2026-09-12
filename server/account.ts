import { createClient } from "@supabase/supabase-js";
import { Router, type RequestHandler, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Envelope } from "../packages/contracts/index.js";

export interface AccountConfig {
  supabaseUrl: string;
  publishableKey: string;
}
export interface AccountIdentity {
  id: string;
  emailConfirmed: true;
  role: "member";
}

export function accountConfig(
  env: NodeJS.ProcessEnv = process.env,
): AccountConfig | null {
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,240}$/.test(key)) return null;
  try {
    const url = new URL(env.SUPABASE_URL ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
    )
      return null;
    return { supabaseUrl: url.origin, publishableKey: key };
  } catch {
    return null;
  }
}

const verifiedUser = z.object({
  id: z.string().uuid(),
  role: z.literal("authenticated"),
  is_anonymous: z.boolean().optional(),
  email_confirmed_at: z.string().datetime({ offset: true }).nullish(),
});

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
function ok<T>(response: Response, data: T) {
  const body: Envelope<T> = {
    schemaVersion: "1.0",
    synthetic: false,
    generatedAt: new Date().toISOString(),
    data,
    coverage: [],
  };
  response.json(body);
}

// The provider response can contain user-editable metadata. Bound it before SDK parsing.
async function boundedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(input, {
    ...init,
    redirect: "error",
    signal: init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout,
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Authentication response unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("Authentication response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(Buffer.concat(chunks), {
    status: response.status,
    headers: response.headers,
  });
}

export function requireAccount(
  config: AccountConfig | null = accountConfig(),
): RequestHandler {
  const client = config
    ? createClient(config.supabaseUrl, config.publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: boundedFetch },
      })
    : null;
  let pending = 0;
  return async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!client) {
      failure(
        response,
        503,
        "auth_unavailable",
        "Account sign-in is not configured.",
      );
      return;
    }
    const authorization = request.headers.authorization ?? "";
    if (!/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(authorization)) {
      failure(response, 401, "unauthorised", "Sign in to continue.");
      return;
    }
    if (pending >= 20) {
      response.set("Retry-After", "5");
      failure(
        response,
        429,
        "rate_limited",
        "Please wait before trying again.",
      );
      return;
    }
    pending++;
    try {
      // getUser verifies the token with the configured Auth server. Never trust local metadata or decoded claims.
      const { data, error } = await client.auth.getUser(authorization.slice(7));
      if (error) {
        const invalid =
          error.status === 401 || error.status === 403 || error.status === 400;
        if (!invalid && error.status === 429) response.set("Retry-After", "5");
        failure(
          response,
          invalid ? 401 : error.status === 429 ? 429 : 503,
          invalid ? "unauthorised" : "auth_unavailable",
          invalid
            ? "Sign in to continue."
            : "Account verification is unavailable.",
        );
        return;
      }
      const parsed = verifiedUser.safeParse(data.user);
      if (!parsed.success) {
        failure(
          response,
          503,
          "auth_unavailable",
          "Account verification is unavailable.",
        );
        return;
      }
      if (parsed.data.is_anonymous || !parsed.data.email_confirmed_at) {
        failure(
          response,
          403,
          "confirmation_required",
          "Use a confirmed email account to continue.",
        );
        return;
      }
      const account: AccountIdentity = {
        id: parsed.data.id,
        emailConfirmed: true,
        role: "member",
      };
      response.locals.account = account;
      next();
    } catch {
      failure(
        response,
        503,
        "auth_unavailable",
        "Account verification is unavailable.",
      );
    } finally {
      pending--;
    }
  };
}

export function createAccountRoutes(): Router {
  const router = Router();
  const config = accountConfig();
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.get("/config", (_request, response) =>
    ok(response, {
      configured: !!config,
      supabaseUrl: config?.supabaseUrl ?? null,
      publishableKey: config?.publishableKey ?? null,
    }),
  );
  router.get("/session", requireAccount(config), (_request, response) =>
    ok(response, response.locals.account as AccountIdentity),
  );
  router.use((request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.set("Allow", "GET, HEAD");
      failure(
        response,
        405,
        "method_not_allowed",
        "Use the account sign-in form.",
      );
    } else
      failure(response, 404, "not_found", "This account page is unavailable.");
  });
  return router;
}
