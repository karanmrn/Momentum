import { test, expect } from "@playwright/test";

test("public evidence shows source coverage and recovers after an invalid response", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let failed = true;
  await page.route("**/api/public/graph?*", async (route) => {
    if (failed)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"schemaVersion":"1.0","data":{}}',
      });
    else await route.continue();
  });
  await page.goto("/?public=1&area=camden_town");
  await page
    .getByRole("tab", { name: "Historical context", exact: true })
    .click();
  const graph = page.getByRole("region", {
    name: "Evidence graph",
    exact: true,
  });
  await expect(graph.getByRole("alert")).toHaveText(
    "Evidence relations are unavailable. Try again.",
  );
  failed = false;
  await graph.getByRole("button", { name: "Refresh graph" }).click();
  await expect(graph.getByRole("table")).toBeVisible();
  await expect(
    graph.getByText("Public source coverage", { exact: false }),
  ).toBeVisible();
  await expect(
    graph.getByText("Fictional community notices", { exact: false }),
  ).toHaveCount(0);
  await graph.getByText("Sources and ontology", { exact: true }).click();
  await expect(
    graph.getByRole("link", { name: "Open source" }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("demo evidence links retain context meaning and fit a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/?demo=1&area=hounslow_town_centre");
  await page
    .getByRole("tab", { name: "Historical context", exact: true })
    .click();
  const graph = page.getByRole("region", {
    name: "Evidence graph",
    exact: true,
  });
  await expect(graph.getByRole("table")).toBeVisible();
  await expect(
    graph.getByText("Fictional community notices with public source coverage", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    graph.getByRole("cell", { name: /Historical source coverage/ }).first(),
  ).toBeVisible();
  await expect(
    graph.getByText(/Monthly police coverage cannot confirm/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
