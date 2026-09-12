import { afterEach, expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAccountClient } from "./account-client";

afterEach(() => vi.unstubAllGlobals());

test("a verification response cannot restore an account after logout", async () => {
  const id = "8ca512ac-9071-4d97-b9aa-70e9b70a0983";
  const user = {
    id,
    email: "member@example.test",
    email_confirmed_at: "2026-09-12T12:00:00Z",
  };
  const payload = Buffer.from(
    JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  const pending: Array<(response: Response) => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/account/session")
        return new Promise<Response>((resolve) => pending.push(resolve));
      if (url.includes("/token"))
        return Response.json({
          access_token: `e30.${payload}.test`,
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_in: 3600,
          user,
        });
      if (url.endsWith("/user")) return Response.json(user);
      if (url.includes("/logout")) return new Response(null, { status: 204 });
      throw new Error("Unexpected test request");
    }),
  );
  const provider = createClient(
    "https://streetwise-account-test.supabase.co",
    "sb_publishable_browser_test",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const client = createAccountClient(provider);
  const listener = vi.fn();
  const failed = vi.fn();
  const unsubscribe = client.subscribe(listener, failed);
  await provider.auth.getSession();
  const login = client
    .signIn({ email: user.email, password: "test-password-123" })
    .catch((error: unknown) => error);
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
  await client.signOut();
  for (const resolve of pending)
    resolve(
      Response.json({
        schemaVersion: "1.0",
        synthetic: false,
        data: { id, emailConfirmed: true, role: "member" },
      }),
    );
  await expect(login).resolves.toEqual(new Error("Account session changed"));
  expect(listener.mock.calls.every(([session]) => session === null)).toBe(true);
  expect(failed).not.toHaveBeenCalled();
  unsubscribe();
});
