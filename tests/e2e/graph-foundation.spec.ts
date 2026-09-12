import { projectSemanticGraph } from "../../packages/semantic-graph";
import { createDemoState } from "../../packages/domain";
import { getDatasetCoverage } from "../../packages/datasets/src/coverage";
import { updateCamdenStudy } from "../../packages/camden-evidence/session";
import { test, expect, type Page } from "@playwright/test";

function state() {
  return {
    revision: 1,
    examples: {
      "CAM-01": "original",
      "CAM-02": "original",
      "CAM-03": "original",
      "CAM-04": "original",
      "CAM-05": "original",
    },
  };
}
async function mockStudy(page: Page) {
  const study = state();
  await page.route("**/api/camden/examples", (route) =>
    route.fulfill({ json: { schemaVersion: "1.0", data: study } }),
  );
  await page.route(/\/api\/camden\/examples\/CAM-\d+$/, async (route) => {
    const request = route.request().postDataJSON();
    const id = route
      .request()
      .url()
      .split("/")
      .at(-1)! as keyof typeof study.examples;
    study.revision++;
    study.examples[id] = request.state;
    await route.fulfill({ json: { schemaVersion: "1.0", data: study } });
  });
  return study;
}

test("Camden shows visible connected nodes, keyboard details, and equivalent records at all widths", async ({
  page,
}) => {
  await mockStudy(page);
  await page.goto("/?evidence=camden");
  const network = page.getByRole("region", {
    name: "Camden evidence network",
    exact: true,
  });
  await expect(
    network.getByText("7 nodes · 6 edges", { exact: true }),
  ).toBeVisible();
  await expect(network.locator("svg > path")).toHaveCount(6);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(network.locator(".en-node")).toHaveCount(7);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    const sizes = await network.locator(".en-node").evaluateAll((nodes) =>
      nodes.map((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      })),
    );
    expect(sizes.every((size) => size.width >= 48 && size.height >= 48)).toBe(
      true,
    );
  }
  await network.locator(".en-node").first().focus();
  await page.keyboard.press("Enter");
  await expect(
    network.getByRole("region", { name: "Selected evidence details" }),
  ).toContainText("Source family");
  await network.getByLabel("Inspect a relationship").selectOption({ index: 1 });
  await expect(
    network.getByRole("region", { name: "Selected evidence details" }),
  ).toContainText("Independence");
  await network.getByRole("button", { name: "Records", exact: true }).click();
  await expect(network.locator(".en-records li")).toHaveCount(7);
  await network.getByLabel("Find a record").fill("fictional");
  await expect(network.locator(".en-records li")).toHaveCount(2);
});

test("Camden corrections and withdrawals use saved acknowledgement and survive reload", async ({
  page,
}) => {
  const study = await mockStudy(page);
  await page.goto("/?evidence=camden");
  await page
    .getByRole("button", { name: "Correct fictional time", exact: true })
    .click();
  await expect(
    page.getByText(
      "Fictional state: corrected. Police source record unchanged.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Fictional state: corrected. Police source record unchanged.",
    ),
  ).toBeVisible();
  expect(study.revision).toBe(2);
  await page
    .getByRole("button", { name: "Withdraw fictional account", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Camden evidence network", exact: true })
      .locator(".en-fiction"),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText(
      "Fictional state: withdrawn. Police source record unchanged.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Report this example", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".ce-columns")).toContainText(
    "Under investigation",
  );
});

test("failed and conflicting study changes preserve the acknowledged state", async ({
  page,
}) => {
  const study = await mockStudy(page);
  await page.goto("/?evidence=camden");
  await page.route("**/api/camden/examples/CAM-01", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "Study change failed." } },
    }),
  );
  await page
    .getByRole("button", { name: "Correct fictional time", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Study change failed.");
  await expect(
    page.getByText(
      "Fictional state: original. Police source record unchanged.",
    ),
  ).toBeVisible();
  study.revision = 2;
  study.examples["CAM-01"] = "corrected";
  await page.route("**/api/camden/examples/CAM-01", (route) =>
    route.fulfill({ status: 409, json: { error: { message: "Conflict" } } }),
  );
  await page
    .getByRole("button", { name: "Correct fictional time", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "latest saved state is shown",
  );
  await expect(
    page.getByText(
      "Fictional state: corrected. Police source record unchanged.",
    ),
  ).toBeVisible();
});

test("Camden example creates a private report only after an acknowledged deliberate action", async ({
  page,
}) => {
  await mockStudy(page);
  let writes = 0;
  await page.route("**/api/camden/examples/CAM-01/report", async (route) => {
    writes++;
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({ expectedRevision: 1 });
    await route.fulfill({
      json: {
        schemaVersion: "1.0",
        data: {
          id: "10000000-0000-4000-8000-000000000099",
          status: "submitted",
          revision: 1,
          createdAt: "2026-09-12T12:00:00Z",
          synthetic: true,
        },
      },
    });
  });
  await page.goto("/?public=1&evidence=camden");
  await expect(
    page.getByRole("button", { name: "Report this example", exact: true }),
  ).toBeEnabled();
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: "Report this example", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved for private review" }),
  ).toBeVisible();
  await expect(
    page.getByText("10000000-0000-4000-8000-000000000099", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open My reports" }),
  ).toHaveAttribute("href", "/?demo=1&area=camden_town&view=reports");
  expect(writes).toBe(1);
});

test("unavailable study shows real records and no fictional actions", async ({
  page,
}) => {
  await page.route("**/api/camden/examples", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { message: "Demonstration access required." } },
    }),
  );
  await page.goto("/?evidence=camden");
  await expect(page.getByRole("alert")).toContainText(
    "Demonstration access required.",
  );
  await expect(
    page.getByRole("link", { name: "Open demonstration access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Report this example", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Camden evidence network", exact: true })
      .locator(".en-fiction"),
  ).toHaveCount(0);
});

test("ordinary report receipt remains successful when the report list refresh fails", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=camden_town");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page
    .getByRole("button", { name: "Share observation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Short title").fill("Fictional receipt test");
  await dialog
    .getByLabel("What you observed")
    .fill("Fictional observation for a receipt recovery test.");
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: {
          schemaVersion: "1.0",
          data: {
            id: "10000000-0000-4000-8000-000000000098",
            status: "submitted",
            revision: 1,
            createdAt: "2026-09-12T12:00:00Z",
            synthetic: true,
          },
        },
      });
    } else
      await route.fulfill({
        status: 503,
        json: { error: { message: "Refresh failed" } },
      });
  });
  await dialog
    .getByRole("button", { name: "Save for review", exact: true })
    .click();
  await expect(
    dialog.getByText("Saved for private review", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("10000000-0000-4000-8000-000000000098", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your observation was saved",
  );
  await expect(
    dialog.getByRole("button", { name: "Save for review", exact: true }),
  ).toHaveCount(0);
});

test("pending report save keeps its receipt open and freezes background controls", async ({
  page,
}) => {
  await page.goto("/?demo=1&area=camden_town");
  await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
  await page
    .getByRole("button", { name: "Share observation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Short title").fill("Fictional pending receipt");
  await dialog
    .getByLabel("What you observed")
    .fill("Fictional report used to verify delayed acknowledgement.");
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await waiting;
    await route.fulfill({
      json: {
        schemaVersion: "1.0",
        data: {
          id: "10000000-0000-4000-8000-000000000097",
          status: "submitted",
          revision: 1,
          createdAt: "2026-09-12T12:00:00Z",
          synthetic: true,
        },
      },
    });
  });
  try {
    await dialog
      .getByRole("button", { name: "Save for review", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Close dialog", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(page.locator("main.main")).toHaveAttribute("inert", "");
  } finally {
    release();
  }
  await expect(
    dialog.getByText("Saved for private review", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("main.main")).not.toHaveAttribute("inert");
});

test("full Camden graph keeps selected details inside the viewport and preserves evidence qualification", async ({
  page,
}) => {
  const domain = createDemoState();
  updateCamdenStudy(domain, "CAM-01", {
    expectedRevision: 1,
    state: "corrected",
  });
  const graph = projectSemanticGraph(
    domain,
    "camden_town",
    getDatasetCoverage("camden_town"),
  );
  expect(graph.nodes.length).toBeGreaterThanOrEqual(49);
  await page.route("**/api/graph?area=camden_town", (route) =>
    route.fulfill({ json: { schemaVersion: "1.0", data: graph } }),
  );
  await page.goto("/?demo=1&area=camden_town");
  await page.getByRole("tab", { name: "Police records", exact: true }).click();
  const network = page.getByRole("region", {
    name: "Connected evidence",
    exact: true,
  });
  const detail = network.getByRole("region", {
    name: "Selected evidence details",
    exact: true,
  });
  for (const width of [390, 1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await network.locator(".en-node").first().click();
    await expect
      .poll(async () => {
        const box = await detail.boundingBox();
        return !!box && box.y >= 0 && box.y + box.height <= 900;
      })
      .toBe(true);
  }
  const corrected = graph.nodes.find((node) => node.id === "fictional:CAM-01")!;
  await network
    .getByRole("button", { name: `Inspect ${corrected.label}`, exact: true })
    .click();
  await expect(detail).toContainText("Reported time");
  await expect(detail).toContainText("Observed time");
  await expect(detail).toContainText(corrected.metadata.correctionNote!);
  await expect(detail).toContainText("self reported unverified");
  const help = graph.nodes.find(
    (node) => node.type === "HelpLocation" && node.metadata.schedule,
  )!;
  await network
    .getByRole("button", { name: `Inspect ${help.label}`, exact: true })
    .click();
  await expect(detail).toContainText(help.metadata.schedule!);
  await expect(detail).toContainText(help.metadata.availability!);
  if (help.metadata.address)
    await expect(detail).toContainText(help.metadata.address);
  const snapshot = graph.nodes.find((node) => node.type === "SourceSnapshot")!;
  await network
    .getByRole("button", { name: `Inspect ${snapshot.label}`, exact: true })
    .click();
  await expect(detail).toContainText(snapshot.provenance!.snapshotSha256!);
  await expect(detail).toContainText(snapshot.provenance!.fetchedAt!);
  const qualified = graph.assertions.find((edge) => edge.metadata?.validFrom)!;
  await network.getByLabel("Inspect a relationship").selectOption(qualified.id);
  for (const label of [
    "Source family",
    "Original claim lineage",
    "Valid from",
    "Valid to",
    "Time precision",
    "Spatial precision",
    "Revision",
    "Source independence",
    "Reason codes",
  ])
    await expect(detail).toContainText(label);
  await expect(detail).toContainText(qualified.metadata!.validFrom!);
  await expect(detail).toContainText(qualified.metadata!.sourceFamilyId);
  await expect
    .poll(async () => {
      const box = await detail.boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= 900;
    })
    .toBe(true);
});
