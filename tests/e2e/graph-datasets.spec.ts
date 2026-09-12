import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  semanticGraphSchema,
  type SemanticGraph,
} from "../../packages/semantic-graph/schema";

const firstId = "a".repeat(64);
const secondId = "b".repeat(64);
const names = { [firstId]: "Dataset Alpha", [secondId]: "Dataset Beta" };
const provenance = {
  sourceId: "dataset-test-source",
  sourceFamilyId: "dataset-test-source",
  sourceUrl: "https://example.org/source",
  fetchedAt: "2026-09-12T10:00:00.000Z",
  originGroupId: null,
};
function records(
  id: string,
  count: number,
  total: number,
  nextOffset: number | null,
) {
  const prefix = id === firstId ? "Alpha" : "Beta";
  const nodes: SemanticGraph["nodes"] = [
    {
      id: "area:camden_town",
      type: "Area",
      label: "Camden Town centre",
      synthetic: false,
      provenance: null,
      metadata: {},
    },
    {
      id: "source:test",
      type: "Source",
      label: `${prefix} source`,
      synthetic: false,
      provenance,
      metadata: {},
    },
  ];
  const assertions: SemanticGraph["assertions"] = [];
  for (let i = 0; i < count; i++) {
    const recordId = `${id}:record:${i}`;
    nodes.push({
      id: recordId,
      type: "DatasetRecord",
      label: `${prefix} record ${i + 1}`,
      synthetic: false,
      provenance,
      metadata: { sourceRecordKey: `${prefix}-${i}`, status: "acquired" },
    });
    for (const [predicate, target] of [
      ["ISSUED_BY", "source:test"],
      ["CONTEXTUAL_AREA_ONLY", "area:camden_town"],
    ] as const)
      assertions.push({
        id: `${recordId}:${predicate}`,
        subjectId: recordId,
        objectId: target,
        predicate,
        inferenceType:
          predicate === "ISSUED_BY" ? "source_statement" : "deterministic_join",
        reasonCodes: ["stored_source_context"],
        evidenceRefs: [recordId],
        methodVersion: "1.0",
        synthetic: false,
      });
  }
  return {
    schemaVersion: "1.0",
    synthetic: false,
    data: {
      graph: semanticGraphSchema.parse({
        ontologyVersion: "1.0",
        pilotId: "camden_town",
        nodes,
        assertions,
        limitations: ["Local research only. Publication remains disabled."],
        truncated: false,
      }),
      total,
      nextOffset,
      dataset: { id, dataset: "police", title: names[id] },
      localResearchOnly: true,
      publicationAllowed: false,
    },
  };
}
async function catalog(page: Page) {
  await page.route("**/api/graph/research/catalog?*", (route) =>
    route.fulfill({
      json: {
        schemaVersion: "1.0",
        synthetic: false,
        data: {
          datasets: [firstId, secondId].map((id) => ({
            id,
            dataset: "police",
            title: names[id],
            totalRecords: id === firstId ? 60 : 7,
            areaRecordCount: id === firstId ? 60 : 7,
            sourceIds: ["dataset-test-source"],
            months: ["2026-07"],
            publicationAllowed: false,
          })),
          localResearchOnly: true,
          publicationAllowed: false,
        },
      },
    }),
  );
  await page.goto("/?workspace=graph&public=1&area=camden_town");
  await page
    .getByRole("button", { name: "Browse all datasets", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Dataset", exact: true }),
  ).toBeVisible();
}

test("A failed dataset switch clears old pagination and retry loads the selected dataset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  let betaRequests = 0;
  await page.route("**/api/graph/research/records?*", (route) => {
    const id = new URL(route.request().url()).searchParams.get("dataset")!;
    if (id === secondId && ++betaRequests === 1)
      return route.fulfill({ status: 503, json: { error: "unavailable" } });
    return route.fulfill({
      json: id === firstId ? records(id, 30, 60, 30) : records(id, 7, 7, null),
    });
  });
  await catalog(page);
  const dataset = page.getByRole("combobox", { name: "Dataset", exact: true });
  await dataset.selectOption(firstId);
  await expect(page.locator(".gx-pagination")).toContainText(
    "1-30 of 60 area records",
  );
  await expect(
    page.getByRole("button", { name: "Next records", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".gc-node")).toHaveCount(32);
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download this Graphify page", exact: true })
    .click();
  const download = await downloadReady;
  const exportedText = await readFile((await download.path())!, "utf8");
  const exported = JSON.parse(exportedText);
  expect(exported.metadata).toMatchObject({
    source: "Validated local research projection",
    localResearchOnly: true,
    publicationAllowed: false,
  });
  expect(exportedText).not.toContain("Validated public evidence projection");
  await dataset.selectOption(secondId);
  await expect(
    page.getByRole("button", { name: "Retry datasets", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gx-pagination")).not.toContainText(
    "of 60 area records",
  );
  await expect(
    page.getByRole("button", { name: "Next records", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".gc-node")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry datasets", exact: true })
    .click();
  await expect(page.locator(".gx-pagination")).toContainText(
    "1-7 of 7 area records",
  );
  await expect(
    page.getByRole("button", { name: "Next records", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".gc-node")).toHaveCount(9);
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(page.locator(".gx-records")).toContainText("Beta record 7");
  await expect(page.locator(".gx-records")).not.toContainText("Alpha record");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("Invalid backward and out-of-range dataset cursors fail closed", async ({
  page,
}) => {
  let nextOffset = 0;
  await page.route("**/api/graph/research/records?*", (route) =>
    route.fulfill({ json: records(firstId, 30, 60, nextOffset) }),
  );
  await catalog(page);
  await page
    .getByRole("combobox", { name: "Dataset", exact: true })
    .selectOption(firstId);
  await expect(
    page.getByRole("button", { name: "Retry datasets", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gc-node")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next records", exact: true }),
  ).toBeDisabled();
  nextOffset = 61;
  await page
    .getByRole("button", { name: "Retry datasets", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry datasets", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gc-node")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next records", exact: true }),
  ).toBeDisabled();
  nextOffset = 30;
  await page
    .getByRole("button", { name: "Retry datasets", exact: true })
    .click();
  await expect(page.locator(".gx-pagination")).toContainText(
    "1-30 of 60 area records",
  );
  await expect(page.locator(".gc-node")).toHaveCount(32);
  await expect(
    page.getByRole("button", { name: "Next records", exact: true }),
  ).toBeEnabled();
});
