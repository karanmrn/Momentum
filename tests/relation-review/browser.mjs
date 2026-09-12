import express from "express";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import { createDatabase } from "../../server/database.ts";
import { createDemoState } from "../../packages/domain/index.ts";
import { createRelationReviewRoutes } from "../../server/relation-review.ts";
const db = await createDatabase(createDemoState, { path: "memory://" });
const id = "c".repeat(64);
await db.create(id);
const app = express();
const server = createServer(app);
const vite = await createViteServer({
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true, hmr: { server } },
  appType: "custom",
});
app.use(express.json({ limit: "8kb" }));
// Isolated browser fixture. Production uses the existing verified session middleware.
app.get("/api/session", (_request, response) =>
  response.json({ data: { persona: "moderator" } }),
);
app.use(
  "/api/relation-review",
  (request, response, next) => {
    response.locals.sessionId = id;
    response.locals.persona = "moderator";
    next();
  },
  createRelationReviewRoutes(db),
);
app.get("/review-harness", async (_request, response) =>
  response
    .type("html")
    .send(
      await vite.transformIndexHtml(
        "/review-harness",
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import React from "react";import "/src/styles.css";import {createRoot} from "react-dom/client";import {RelationReview} from "/src/RelationReview.tsx";createRoot(document.getElementById("root")).render(React.createElement(RelationReview));</script></body></html>',
      ),
    ),
);
app.use(vite.middlewares);
server.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 320, height: 840 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/review-harness`);
  await page
    .getByRole("button", { name: "Load four fictional examples", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Fictional examples loaded",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Generate candidates", exact: true })
    .click();
  await expect(page.locator(".rr-candidates li")).toHaveCount(3);
  await page
    .locator(".rr-candidates button")
    .filter({ hasText: "unknown" })
    .first()
    .click();
  await page
    .getByLabel("Review reason", { exact: true })
    .fill("Fictional asset and source intervals checked.");
  await page
    .getByRole("button", { name: "Approve operational relation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retract relation", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Select pair for grouping", exact: true })
    .click();
  await page
    .getByLabel("Group change reason", { exact: true })
    .fill("Group these two fictional accounts for review.");
  await page
    .getByRole("button", { name: "Merge selected reports", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review group 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ungroup all members", exact: true })
    .click();
  await expect(
    page.getByText("No review groups exist.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Undo latest group change", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review group 1", exact: true }),
  ).toBeVisible();
  const output = resolve(".data/relation-review-e2e");
  await mkdir(output, { recursive: true });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: resolve(output, `review-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      journey: "generate, inspect, approve, merge, split, undo",
      widths: [320, 1280],
      errors,
      output,
    }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await vite.close();
  await db.close();
}
