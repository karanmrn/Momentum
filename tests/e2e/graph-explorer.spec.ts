import { expect, test, type Page } from "@playwright/test";
import {
  projectSemanticGraph,
  semanticGraphSchema,
} from "../../packages/semantic-graph";
import { getDatasetCoverage } from "../../packages/datasets/src/coverage";
import type { PilotId } from "../../packages/contracts";

const publicGraph = (area: PilotId = "camden_town") => ({
  schemaVersion: "1.0",
  synthetic: false,
  data: projectSemanticGraph(null, area, getDatasetCoverage(area)),
});
const graphPath = /\/api\/public\/graph\?area=/;
async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}
async function loaded(page: Page) {
  await expect(
    page.getByRole("group", { name: "Interactive area graph" }),
  ).toBeVisible();
  await expect(page.locator(".gc-node").first()).toBeVisible();
  await expect(page.locator(".gc-edge-line").first()).toBeVisible();
}

for (const width of [320, 390, 1440]) {
  test(`Graph view is reachable from public and demo pages at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ["public", "demo"]) {
      await page.goto(`/?${mode}=1&area=camden_town`);
      const entry = page
        .locator("header")
        .getByRole("link", { name: "Graph view", exact: true });
      await expect(entry).toBeVisible();
      await entry.click();
      await expect(page).toHaveURL(/workspace=graph/);
      await loaded(page);
      await expect(
        page.getByLabel("Include fictional reports"),
      ).not.toBeChecked();
      await noOverflow(page);
      for (const [label, area] of [
        ["Hounslow", "hounslow_town_centre"],
        ["West Croydon", "west_croydon"],
        ["Camden", "camden_town"],
      ]) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`area=${area}`));
        await expect(
          page.getByRole("button", { name: label, exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await loaded(page);
        await noOverflow(page);
      }
      await page
        .getByRole("button", { name: "West Croydon", exact: true })
        .click();
      await loaded(page);
      await page
        .getByRole("button", { name: "Back to area", exact: true })
        .click();
      await expect(page).toHaveURL(/area=west_croydon/);
      await expect(page).not.toHaveURL(/workspace=/);
      await expect(page.getByLabel("Choose pilot area")).toHaveValue(
        "west_croydon",
      );
    }
  });
}

test("Graph route defaults to source-only without starting a private session", async ({
  page,
}) => {
  const paths: string[] = [];
  page.on("request", (request) => paths.push(new URL(request.url()).pathname));
  await page.goto("/?workspace=graph&demo=1&area=camden_town");
  await loaded(page);
  expect(paths).toContain("/api/public/graph");
  expect(paths).not.toContain("/api/session");
  expect(paths).not.toContain("/api/graph");
  await expect(
    page.getByRole("link", { name: "Download Graphify data" }),
  ).toHaveAttribute("href", "/api/public/graph/export?area=camden_town");
});

test("Fictional reports are explicit and request the private graph", async ({
  page,
}) => {
  await page.goto("/?workspace=graph&public=1&area=camden_town");
  await loaded(page);
  const session = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/session",
  );
  const graph = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/graph",
  );
  await page.getByLabel("Include fictional reports").check();
  expect((await session).ok()).toBe(true);
  expect((await graph).ok()).toBe(true);
  await loaded(page);
  await expect(
    page.getByText(
      "Fictional reports are demonstration data. They do not describe actual incidents.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/examples=1/);
  await expect(page.locator(".gc-fiction").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download Graphify data" }),
  ).toHaveAttribute("href", "/api/graph/export?area=camden_town");
  await page.getByLabel("Include fictional reports").uncheck();
  await loaded(page);
  await expect(page.locator(".gc-fiction")).toHaveCount(0);
  await expect(page).not.toHaveURL(/examples=1/);
});

for (const failure of [
  "unavailable",
  "invalid schema",
  "private node",
  "synthetic envelope",
  "synthetic node",
  "local dataset record",
] as const) {
  test(`Public graph rejects ${failure} without exposing records`, async ({
    page,
  }) => {
    await page.route(graphPath, (route) => {
      const body = publicGraph();
      if (failure === "unavailable")
        return route.fulfill({ status: 503, json: { error: "unavailable" } });
      if (failure === "invalid schema")
        return route.fulfill({ json: { ...body, schemaVersion: "invalid" } });
      if (failure === "private node")
        (
          body.data.nodes[0] as unknown as { type: string; label: string }
        ).type = "PrivateReport";
      if (failure === "synthetic envelope") body.synthetic = true;
      if (failure === "synthetic node")
        body.data.nodes.find((node) => node.type === "Source")!.synthetic =
          true;
      if (failure === "local dataset record") {
        const source = body.data.nodes.find(
          (node) => node.provenance !== null,
        )!;
        body.data.nodes.push({
          ...source,
          id: "local-only-record",
          type: "DatasetRecord",
          synthetic: false,
        });
        semanticGraphSchema.parse(body.data);
      }
      body.data.nodes[0].label = "PRIVATE_PAYLOAD_MUST_NOT_RENDER";
      return route.fulfill({ json: body });
    });
    await page.goto("/?workspace=graph&public=1&area=camden_town");
    await expect(
      page.getByRole("heading", { name: "Graph unavailable" }),
    ).toBeVisible();
    await expect(page.locator(".gc-node")).toHaveCount(0);
    await expect(page.getByText("PRIVATE_PAYLOAD_MUST_NOT_RENDER")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "Download Graphify data" }),
    ).toHaveCount(0);
    await page.unroute(graphPath);
    await page.getByRole("button", { name: "Retry graph" }).click();
    await loaded(page);
  });
}

test("A failed demo session retains a path back to public sources", async ({
  page,
}) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ status: 503, json: { error: "unavailable" } }),
  );
  await page.goto("/?workspace=graph&public=1&area=camden_town&examples=1");
  await expect(
    page.getByRole("heading", { name: "Graph unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Fictional reports need an available demo session. You can still open public sources.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show public sources" }).click();
  await loaded(page);
  await expect(page.getByLabel("Include fictional reports")).not.toBeChecked();
});

test("A late area response cannot replace the current graph", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(graphPath, async (route) => {
    const area = new URL(route.request().url()).searchParams.get(
      "area",
    ) as PilotId;
    if (area === "camden_town") {
      started();
      await held;
    }
    await route.fulfill({ json: publicGraph(area) }).catch(() => {});
  });
  await page.goto("/?workspace=graph&public=1&area=camden_town");
  await requested;
  await page.getByRole("button", { name: "Hounslow", exact: true }).click();
  await loaded(page);
  const expected = publicGraph("hounslow_town_centre").data;
  await expect(page.locator(".gc-node")).toHaveCount(expected.nodes.length);
  release();
  await page.getByRole("button", { name: "Records", exact: true }).click();
  await expect(page.locator(".gx-records li")).toHaveCount(
    expected.nodes.length,
  );
  await expect(page.locator(".gx-records")).not.toContainText("Police Record");
  await expect(page).toHaveURL(/area=hounslow_town_centre/);
});

test("Camden comparison explains context without claiming a crime cause", async ({
  page,
}) => {
  await page.goto("/?workspace=graph&public=1&area=camden_town");
  await loaded(page);
  await page
    .getByRole("button", { name: "Details and connections", exact: true })
    .click();
  const records = publicGraph().data.nodes.filter(
    (node) => node.type === "PoliceRecord",
  );
  await page
    .getByRole("combobox", { name: "First record", exact: true })
    .selectOption(records[0].id);
  await page
    .getByRole("combobox", { name: "Second record", exact: true })
    .selectOption(records[1].id);
  await expect(
    page.getByRole("heading", { name: "Context connection only" }),
  ).toBeVisible();
  await expect(page.locator(".gx-path")).toContainText(
    "does not establish that separate crimes are related",
  );
  await expect(page.locator(".gx-path")).toContainText(
    "does not establish a cause",
  );
  await expect(page.locator(".gc-edge-active")).toHaveCount(2);
});

test("Keyboard inspection and search work on the graph and equivalent records", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?workspace=graph&public=1&area=camden_town");
  await loaded(page);
  const nodeName = await page
    .locator(".gc-node")
    .first()
    .getAttribute("aria-label");
  const node = page.getByRole("button", { name: nodeName!, exact: true });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(node).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Compare this record" }),
  ).toBeVisible();
  const edge = page.locator(".gc-edge").first();
  await edge.focus();
  await page.keyboard.press("Space");
  await expect(edge).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".gx-inspection")).toContainText("Connection");
  await page.getByLabel("Search graph").fill("no-record-matches-this-phrase");
  await expect(page.locator(".gc-node")).toHaveCount(0);
  await expect(
    page.getByText("No records in this view", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search graph").clear();
  await loaded(page);
  await page.getByRole("button", { name: "Records", exact: true }).click();
  const record = page.locator(".gx-records button").first();
  await record.focus();
  await page.keyboard.press("Enter");
  await expect(record).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Search graph").fill("no-record-matches-this-phrase");
  await expect(page.locator(".gx-records li")).toHaveCount(0);
  await page.getByLabel("Search graph").clear();
  await expect(page.locator(".gx-records li")).toHaveCount(
    publicGraph().data.nodes.length,
  );
  await noOverflow(page);
});
