import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pilotSchema } from "../packages/contracts/index.js";
import type { DemoDatabase } from "./database.js";
import { getDatasetCoverage } from "../packages/datasets/src/coverage.js";
import { projectSemanticGraph } from "../packages/semantic-graph/index.js";

const querySchema = z
  .object({
    area: pilotSchema,
  })
  .strict();

export function createSemanticRoutes(
  store?: Pick<DemoDatabase, "graph">,
): Router {
  const router = Router();
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(request.method)) {
      response
        .set("Allow", "GET, HEAD")
        .status(405)
        .json({
          schemaVersion: "1.0",
          error: {
            code: "method_not_allowed",
            message: "Evidence relations are read-only.",
          },
          requestId: randomUUID(),
        });
      return;
    }
    next();
  });
  router.get("/", async (request, response) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      response.status(400).json({
        schemaVersion: "1.0",
        error: {
          code: "invalid_input",
          message: "Choose a pilot area and a supported evidence view.",
        },
        requestId: randomUUID(),
      });
      return;
    }
    try {
      if (store && typeof response.locals.sessionId !== "string") {
        response.status(401).json({
          schemaVersion: "1.0",
          error: {
            code: "unauthorised",
            message: "A demonstration session is required.",
          },
          requestId: randomUUID(),
        });
        return;
      }
      const data = store
        ? await store.graph(response.locals.sessionId, query.data.area)
        : projectSemanticGraph(
            null,
            query.data.area,
            getDatasetCoverage(query.data.area),
          );
      response.json({
        schemaVersion: "1.0",
        synthetic: Boolean(store),
        generatedAt: new Date().toISOString(),
        data,
        coverage: [],
      });
    } catch (error) {
      const notFound =
        error instanceof Error && "code" in error && error.code === "not_found";
      response
        .status(notFound ? 404 : 503)
        .json({
          schemaVersion: "1.0",
          error: {
            code: notFound ? "not_found" : "source_unavailable",
            message: notFound
              ? "This evidence is not available."
              : "Evidence relations are unavailable. Try again.",
          },
          requestId: randomUUID(),
        });
    }
  });
  return router;
}
