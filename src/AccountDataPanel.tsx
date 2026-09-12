import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { areas, pilotSchema } from "../packages/contracts";
import type { AccountClient } from "./AccountPanel";
import "./AccountDataPanel.css";

const categories = ["infrastructure", "community", "transport"] as const;
const followsSchema = z.object({
  pilotIds: z.array(pilotSchema).max(3),
  categories: z.array(z.enum(categories)).max(3),
  paused: z.boolean(),
});
const inboxSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      pilotId: pilotSchema,
      noticeId: z.string(),
      createdAt: z.string().datetime(),
      readAt: z.string().datetime().nullable(),
    }),
  )
  .max(1000);
const scopesSchema = z
  .array(
    z.object({
      pilotId: pilotSchema,
      role: z.enum(["moderator", "partner"]),
      expiresAt: z.string().datetime().nullable(),
    }),
  )
  .max(1000);
type Follows = z.infer<typeof followsSchema>;
type Inbox = z.infer<typeof inboxSchema>;
type Scopes = z.infer<typeof scopesSchema>;
export function AccountDataPanel({
  client,
  accountId,
  onDeleted,
}: {
  client: AccountClient;
  accountId: string;
  onDeleted: () => Promise<void>;
}) {
  const [follows, setFollows] = useState<Follows>();
  const [inbox, setInbox] = useState<Inbox>([]);
  const [scopes, setScopes] = useState<Scopes>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [confirmation, setConfirmation] = useState("");
  const [deleted, setDeleted] = useState(false);
  const generation = useRef(0);
  function request(
    path: string,
    method: "GET" | "PUT" | "PATCH" | "DELETE" = "GET",
    body?: unknown,
  ) {
    if (!client.requestData) throw new Error("Account data is unavailable.");
    return client.requestData(path, { accountId, method, body });
  }
  useEffect(() => {
    const version = ++generation.current;
    setFollows(undefined);
    setInbox([]);
    setScopes([]);
    setError("");
    setMessage("");
    setConfirmation("");
    setBusy(true);
    Promise.all([request("/follows"), request("/inbox"), request("/scopes")])
      .then(([f, i, s]) => {
        const next = {
          follows: followsSchema.parse(f),
          inbox: inboxSchema.parse(i),
          scopes: scopesSchema.parse(s),
        };
        if (generation.current === version) {
          setFollows(next.follows);
          setInbox(next.inbox);
          setScopes(next.scopes);
        }
      })
      .catch((error) => {
        if (generation.current === version)
          setError(
            error instanceof Error && !(error instanceof z.ZodError)
              ? error.message
              : "Account data is unavailable. Try again.",
          );
      })
      .finally(() => {
        if (generation.current === version) setBusy(false);
      });
    return () => {
      generation.current++;
    };
  }, [client, accountId, attempt]);
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const version = generation.current;
    try {
      await action();
    } catch (error) {
      if (version === generation.current)
        setError(
          error instanceof Error && !(error instanceof z.ZodError)
            ? error.message
            : "Account data is unavailable. Try again.",
        );
    } finally {
      if (version === generation.current) setBusy(false);
    }
  }
  async function exportData() {
    const value = await request("/export");
    const result = z
      .object({
        reports: z
          .array(
            z.object({
              id: z.string().uuid(),
              clientRequestId: z.string().uuid(),
              pilotId: pilotSchema,
              title: z.string().max(120),
              description: z.string().max(2000),
              sourceBasis: z.enum(["firsthand", "other_source"]),
              createdAt: z.string().datetime(),
            }),
          )
          .max(10000),
        follows: followsSchema,
        inbox: inboxSchema.max(10000),
        scopes: z
          .array(
            scopesSchema.element.extend({
              revokedAt: z.string().datetime().nullable(),
            }),
          )
          .max(10000),
      })
      .parse(value);
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "streetwise-account-data.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Account data exported.");
  }
  if (deleted)
    return (
      <div className="account-data">
        <p role="status">
          Your application data was deleted. Your sign-in account still exists.
        </p>
        <button
          className="button secondary"
          onClick={() => void act(onDeleted)}
          disabled={busy}
        >
          Log out
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="account-data" aria-busy={busy}>
      <h3>Private account data</h3>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!follows ? (
        <>
          <p role="status">
            {busy ? "Loading account data…" : "Account data has not loaded."}
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setAttempt(attempt + 1)}
          >
            Retry account data
          </button>
        </>
      ) : (
        <>
          <form
            aria-label="Account follows"
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                setFollows(
                  followsSchema.parse(
                    await request("/follows", "PUT", follows),
                  ),
                );
                setMessage("Account follows saved.");
              });
            }}
          >
            <fieldset disabled={busy}>
              <legend>Follow areas</legend>
              {areas.map((area) => (
                <label className="account-check" key={area.id}>
                  <input
                    type="checkbox"
                    checked={follows.pilotIds.includes(area.id)}
                    onChange={(e) =>
                      setFollows({
                        ...follows,
                        pilotIds: e.target.checked
                          ? [...follows.pilotIds, area.id]
                          : follows.pilotIds.filter((id) => id !== area.id),
                      })
                    }
                  />
                  {area.shortName}
                </label>
              ))}
            </fieldset>
            <fieldset disabled={busy}>
              <legend>Follow categories</legend>
              {categories.map((category) => (
                <label className="account-check" key={category}>
                  <input
                    type="checkbox"
                    checked={follows.categories.includes(category)}
                    onChange={(e) =>
                      setFollows({
                        ...follows,
                        categories: e.target.checked
                          ? [...follows.categories, category]
                          : follows.categories.filter(
                              (value) => value !== category,
                            ),
                      })
                    }
                  />
                  {category[0].toUpperCase() + category.slice(1)}
                </label>
              ))}
            </fieldset>
            <label className="account-check">
              <input
                type="checkbox"
                disabled={busy}
                checked={follows.paused}
                onChange={(e) =>
                  setFollows({ ...follows, paused: e.target.checked })
                }
              />
              Pause updates
            </label>
            <button className="button" disabled={busy}>
              Save account follows
            </button>
          </form>
          <h3>Private inbox</h3>
          {inbox.length === 0 ? (
            <p>No account updates.</p>
          ) : (
            <ul>
              {inbox.map((item) => (
                <li key={item.id}>
                  <span>
                    {areas.find((area) => area.id === item.pilotId)?.shortName}:{" "}
                    {item.noticeId}
                  </span>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </time>
                  {item.readAt ? (
                    <span>Read</span>
                  ) : (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await request(`/inbox/${item.id}`, "PATCH", {
                            read: true,
                          });
                          setInbox(inboxSchema.parse(await request("/inbox")));
                        })
                      }
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <h3>Account scopes</h3>
          {scopes.length === 0 ? (
            <p>No area role assignments.</p>
          ) : (
            <ul>
              {scopes.map((scope, i) => (
                <li key={i}>
                  {areas.find((area) => area.id === scope.pilotId)?.shortName}:{" "}
                  {scope.role}
                  {scope.expiresAt
                    ? ` until ${new Date(scope.expiresAt).toLocaleDateString()}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void act(exportData)}
          >
            Export account data
          </button>
          <h3>Delete application data</h3>
          <p>
            This deletes your application data. Your sign-in account remains
            with the account provider.
          </p>
          <label>
            Type DELETE MY ACCOUNT DATA
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || confirmation !== "DELETE MY ACCOUNT DATA"}
            onClick={() =>
              void act(async () => {
                z.object({ deleted: z.literal(true) }).parse(
                  await request("", "DELETE", { confirmation }),
                );
                setFollows(undefined);
                setInbox([]);
                setScopes([]);
                setDeleted(true);
                await onDeleted();
              })
            }
          >
            Delete my application data
          </button>
        </>
      )}
    </div>
  );
}
