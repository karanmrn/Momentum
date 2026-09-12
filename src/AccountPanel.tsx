import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import "./AccountPanel.css";
import { loadAccountClient } from "./account-client";

export interface AccountSession {
  id: string;
  email: string | null;
}

export interface AccountCredentials {
  email: string;
  password: string;
}

export type AccountSignupResult =
  | { status: "authenticated"; session: AccountSession }
  | { status: "confirmation_required" };

export interface AccountClient {
  getSession(): Promise<AccountSession | null>;
  signIn(credentials: AccountCredentials): Promise<AccountSession>;
  signUp(credentials: AccountCredentials): Promise<AccountSignupResult>;
  signOut(): Promise<void>;
  subscribe(
    listener: (session: AccountSession | null) => void,
    onError: () => void,
  ): () => void;
}

export interface AccountPanelProps {
  client?: AccountClient;
  embedded?: boolean;
}

export function AccountAccess({ embedded = false }: { embedded?: boolean }) {
  const [client, setClient] = useState<AccountClient>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    loadAccountClient().then(
      (next) => {
        if (active) {
          setClient(next);
          setLoading(false);
        }
      },
      () => {
        if (active) {
          setFailed(true);
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  if (loading)
    return (
      <section
        className={`account-panel${embedded ? " account-embedded" : ""}`}
      >
        {!embedded && <h2>Your account</h2>}
        <p role="status">Loading account access…</p>
      </section>
    );
  if (failed)
    return (
      <section
        className={`account-panel${embedded ? " account-embedded" : ""}`}
      >
        {!embedded && <h2>Your account</h2>}
        <p role="alert">Could not load account access.</p>
        <button
          className="button secondary"
          onClick={() => setAttempt(attempt + 1)}
        >
          Retry account access
        </button>
      </section>
    );
  return <AccountPanel client={client} embedded={embedded} />;
}

export function AccountPanel({ client, embedded = false }: AccountPanelProps) {
  const headingId = useId();
  const emailId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const form = useRef<HTMLFormElement>(null);
  const mounted = useRef(false);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(Boolean(client));
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    mounted.current = true;
    let active = true;
    let changed = false;
    setSession(null);
    setError("");
    setMessage("");
    setLoadFailed(false);
    setLoading(Boolean(client));
    const unsubscribe = client?.subscribe(
      (next) => {
        changed = true;
        if (active) {
          setSession(next);
          setLoading(false);
          setLoadFailed(false);
          if (next) {
            setError("");
            setMessage("");
          }
          form.current?.reset();
        }
      },
      () => {
        changed = true;
        if (active) {
          setSession(null);
          setLoading(false);
          setLoadFailed(true);
          setError(
            (current) => current || "Could not check your account. Try again.",
          );
        }
      },
    );
    client?.getSession().then(
      (next) => {
        if (active && !changed) {
          setSession(next);
          setLoading(false);
        }
      },
      () => {
        if (active && !changed) {
          setLoading(false);
          setLoadFailed(true);
          setError("Could not check your account. Try again.");
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      unsubscribe?.();
      form.current?.reset();
    };
  }, [client, attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const currentForm = event.currentTarget;
    const data = new FormData(currentForm);
    const credentials = {
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    };
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        const next = await client.signIn(credentials);
        if (mounted.current) setSession(next);
      } else {
        const result = await client.signUp(credentials);
        if (mounted.current) {
          if (result.status === "authenticated") setSession(result.session);
          else
            setMessage(
              "Check your email to confirm your account, then log in.",
            );
        }
      }
    } catch {
      if (mounted.current) {
        setError(
          mode === "login"
            ? "Could not log in. Check your details and email confirmation, then try again."
            : "Could not create your account. Try again, or log in if you already have an account.",
        );
      }
    } finally {
      currentForm.reset();
      credentials.password = "";
      if (mounted.current) setBusy(false);
    }
  }

  async function signOut() {
    if (!client || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await client.signOut();
      if (mounted.current) {
        setSession(null);
        setMessage("You are logged out.");
      }
    } catch {
      if (mounted.current) setError("Could not log out. Try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section
      className={`account-panel${embedded ? " account-embedded" : ""}`}
      aria-labelledby={embedded ? undefined : headingId}
      aria-busy={loading || busy}
    >
      {!embedded && <h2 id={headingId}>Your account</h2>}
      {!client ? (
        <p role="status">
          Accounts are not available yet. You can still browse public
          information.
        </p>
      ) : loading ? (
        <p role="status">Checking your account…</p>
      ) : loadFailed ? (
        <button
          className="button secondary"
          type="button"
          onClick={() => setAttempt(attempt + 1)}
        >
          Retry account check
        </button>
      ) : session ? (
        <div className="account-session">
          <p>Logged in{session.email ? ` as ${session.email}` : ""}.</p>
          <p>Community reports remain in the fictional demo.</p>
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={signOut}
          >
            {busy ? "Logging out…" : "Log out"}
          </button>
        </div>
      ) : (
        <>
          <div className="account-modes" aria-label="Account action">
            <button
              className={`button${mode === "login" ? "" : " secondary"}`}
              type="button"
              aria-pressed={mode === "login"}
              disabled={busy}
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
                form.current?.reset();
              }}
            >
              Log in
            </button>
            <button
              className={`button${mode === "signup" ? "" : " secondary"}`}
              type="button"
              aria-pressed={mode === "signup"}
              disabled={busy}
              onClick={() => {
                setMode("signup");
                setError("");
                setMessage("");
                form.current?.reset();
              }}
            >
              Create account
            </button>
          </div>
          <form
            ref={form}
            onSubmit={submit}
            aria-label={
              mode === "login"
                ? "Log in to Momentum"
                : "Create a Momentum account"
            }
          >
            <label htmlFor={emailId}>Email</label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={254}
              disabled={busy}
            />
            <label htmlFor={passwordId}>Password</label>
            <input
              id={passwordId}
              name="password"
              type="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              required
              minLength={mode === "signup" ? 8 : undefined}
              maxLength={128}
              aria-describedby={mode === "signup" ? passwordHintId : undefined}
              disabled={busy}
            />
            {mode === "signup" && (
              <p id={passwordHintId} className="account-password-hint">
                Use at least 8 characters.
              </p>
            )}
            <button className="button" type="submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Continue"
                  : "Create your account"}
            </button>
          </form>
        </>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
