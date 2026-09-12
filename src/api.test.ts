import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

describe("API client", () => {
  it("uses same-origin credentials for private data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
      vi
        .fn()
        .mockResolvedValue(
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
    await api.reports().catch((error: ApiError) => {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBe("conflict");
      expect(error.status).toBe(409);
    });
  });
});
