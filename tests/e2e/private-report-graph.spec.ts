import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const storageKey = "momentum:report-graph-context";
const privateTitle = "PRIVATE_GRAPH_OWNED_SENTINEL";
async function context(page: Page, reportId: string, persona = "alex") {
  await page.addInitScript(
    ({ storageKey, reportId, persona }) => {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          reportId,
          persona,
          pilotId: "camden_town",
        }),
      );
    },
    { storageKey, reportId, persona },
  );
}
async function create(page: Page) {
  await page.request.get("/api/session");
  const response = await page.request.post("/api/community-workflow/reports", {
    headers: { "Idempotency-Key": randomUUID() },
    data: {
      pilotId: "camden_town",
      category: "access",
      title: privateTitle,
      place: "Camden station approach",
      observedFrom: "2026-09-12T12:00:00Z",
      observedTo: "2026-09-12T12:00:00Z",
      timePrecision: "approximate_time",
      basis: "firsthand",
      narrative: "PRIVATE_NARRATIVE_SENTINEL",
      publication: "private_only",
      synthetic: true,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data;
}
test("public graph rejects a stored private report context", async ({
  page,
}) => {
  await context(page, randomUUID());
  let workflowRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/community-workflow")) workflowRequests++;
  });
  await page.goto("/?public=1&workspace=graph&area=camden_town&examples=1");
  await expect(page.locator(".gc-node").first()).toBeVisible();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), storageKey),
  ).toBeNull();
  expect(workflowRequests).toBe(0);
  await expect(
    page.getByText("Your report graph", { exact: true }),
  ).toHaveCount(0);
});
test("private graph rejects a different account context", async ({ page }) => {
  await context(page, randomUUID(), "sam");
  await page.goto("/?demo=1&workspace=graph&area=camden_town&examples=1");
  await expect(
    page.getByText(
      "The account changed. Open the report again from My reports.",
    ),
  ).toBeVisible();
  await expect(
    page.locator(".gc-node[aria-label*='PrivateObservation']"),
  ).toHaveCount(0);
});
test("withdrawn report does not become a private graph node", async ({
  page,
}) => {
  const receipt = await create(page);
  const withdrawn = await page.request.patch(
    `/api/community-workflow/reports/${receipt.id}`,
    {
      headers: { "Idempotency-Key": randomUUID() },
      data: { action: "withdraw", expectedRevision: receipt.revision },
    },
  );
  expect(withdrawn.ok()).toBeTruthy();
  await context(page, receipt.report.id);
  await page.goto("/?demo=1&workspace=graph&area=camden_town&examples=1");
  await expect(
    page.getByText(
      "This report was withdrawn or retracted. It is not shown in the graph.",
    ),
  ).toBeVisible();
  await expect(
    page.locator(".gc-node[aria-label*='PrivateObservation']"),
  ).toHaveCount(0);
});
test("owned report appears privately and stays out of graph exports and comparison", async ({
  page,
}) => {
  const receipt = await create(page);
  await context(page, receipt.report.id);
  await page.goto("/?demo=1&workspace=graph&area=camden_town&examples=1");
  await expect(
    page.getByRole("heading", { name: privateTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("PRIVATE_NARRATIVE_SENTINEL", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("First record")
      .locator("option")
      .filter({ hasText: privateTitle }),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("Second record")
      .locator("option")
      .filter({ hasText: privateTitle }),
  ).toHaveCount(0);
  const event = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download Graphify data", exact: true })
    .click();
  const download = await event;
  const output = await readFile((await download.path())!, "utf8");
  expect(output).not.toContain(privateTitle);
  expect(output).not.toContain("PRIVATE_NARRATIVE_SENTINEL");
  expect(output).not.toContain(receipt.report.id);
});
