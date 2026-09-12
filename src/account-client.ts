import {
  createClient,
  type SupabaseClient,
  type Session,
} from "@supabase/supabase-js";
import { z } from "zod";
import type { AccountClient, AccountSession } from "./AccountPanel";

const configSchema = z.object({
  schemaVersion: z.literal("1.0"),
  synthetic: z.literal(false),
  data: z.discriminatedUnion("configured", [
    z.object({
      configured: z.literal(false),
      supabaseUrl: z.null(),
      publishableKey: z.null(),
    }),
    z.object({
      configured: z.literal(true),
      supabaseUrl: z.string().url(),
      publishableKey: z.string().min(1),
    }),
  ]),
});
const verifiedSessionSchema = z.object({
  schemaVersion: z.literal("1.0"),
  synthetic: z.literal(false),
  data: z.object({
    id: z.string().uuid(),
    emailConfirmed: z.literal(true),
    role: z.literal("member"),
  }),
});

let accountClient: Promise<AccountClient | undefined> | undefined;

export function loadAccountClient(): Promise<AccountClient | undefined> {
  accountClient ??= configureAccountClient().catch((error) => {
    accountClient = undefined;
    throw error;
  });
  return accountClient;
}

async function configureAccountClient(): Promise<AccountClient | undefined> {
  const response = await fetch("/api/account/config", {
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Account configuration unavailable");
  const { data } = configSchema.parse(await response.json());
  if (!data.configured) return;
  const url = new URL(data.supabaseUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Account configuration invalid");
  }
  return createAccountClient(
    createClient(data.supabaseUrl, data.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  );
}

export function createAccountClient(provider: SupabaseClient): AccountClient {
  let revision = 0;

  async function verify(
    session: Session,
    expectedRevision: number,
  ): Promise<AccountSession> {
    const { data, error } = await provider.auth.getUser(session.access_token);
    if (error || !data.user || !data.user.email_confirmed_at)
      throw new Error("Account not confirmed");
    const response = await fetch("/api/account/session", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Account verification failed");
    const verified = verifiedSessionSchema.parse(await response.json());
    if (verified.data.id !== data.user.id || expectedRevision !== revision) {
      throw new Error("Account session changed");
    }
    return { id: verified.data.id, email: data.user.email ?? null };
  }

  return {
    async getSession() {
      const expectedRevision = revision;
      const { data, error } = await provider.auth.getSession();
      if (error) throw error;
      return data.session ? verify(data.session, expectedRevision) : null;
    },
    async signIn(credentials) {
      const { data, error } =
        await provider.auth.signInWithPassword(credentials);
      if (error) throw error;
      return verify(data.session, revision);
    },
    async signUp(credentials) {
      const { data, error } = await provider.auth.signUp(credentials);
      if (error) throw error;
      if (!data.session) return { status: "confirmation_required" };
      return {
        status: "authenticated",
        session: await verify(data.session, revision),
      };
    },
    async signOut() {
      revision += 1;
      const { error } = await provider.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
    subscribe(listener, onError) {
      let active = true;
      const { data } = provider.auth.onAuthStateChange((_event, session) => {
        const expectedRevision = ++revision;
        if (!session) {
          listener(null);
          return;
        }
        // Supabase holds its auth lock during callbacks. Verify after it releases the lock.
        setTimeout(() => {
          if (!active || expectedRevision !== revision) return;
          void verify(session, expectedRevision).then(
            (next) => {
              if (active && expectedRevision === revision) listener(next);
            },
            () => {
              if (active && expectedRevision === revision) onError();
            },
          );
        }, 0);
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    },
  };
}
