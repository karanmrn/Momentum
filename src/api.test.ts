import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

describe("API client", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("uses same-origin credentials for private data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          schemaVersion: "1.0",
          synthetic: true,
          generatedAt: "",
          coverage: [],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await api.reports();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("exposes a safe server error to the interface", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "conflict",
              message: "This record changed. Refresh and try again.",
            },
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(api.reports()).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
  });

  it.each([
    "<html>Proxy response</html>",
    "null",
    "[]",
    "{}",
    '{"schemaVersion":"1.0","data":null}',
    '{"schemaVersion":"1.0","data":"unexpected"}',
    '{"schemaVersion":"2.0","data":[]}',
  ])("rejects a malformed successful response: %s", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    await expect(api.reports()).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });

  it("preserves the status when an error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })),
    );
    await expect(api.reports()).rejects.toMatchObject({
      message: "Request failed (503)",
      status: 503,
    });
  });
});
