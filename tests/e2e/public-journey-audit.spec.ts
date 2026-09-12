import { test, expect } from "@playwright/test";

test("help stays in a loading state during area changes and offers official routes", async ({
  page,
}) => {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  let release: (() => void) | undefined;
  await page.route("**/api/public/help?area=camden_town", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      json: { data: [], schemaVersion: "1.0", synthetic: false },
    });
  });
  await page.goto("/?public=1&area=hounslow_town_centre");
  await expect(
    page.getByRole("combobox", { name: "Choose pilot area" }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Get help", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Choose pilot area" })
    .selectOption("camden_town");
  await expect(
    page.getByText("Loading help directory.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No help locations returned", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Report to the police", exact: true }),
  ).toHaveAttribute("href", "https://www.met.police.uk/ro/report/");
  await expect(
    page.getByRole("link", { name: "Report a street problem", exact: true }),
  ).toHaveAttribute("href", "https://www.camden.gov.uk/love-clean-streets");
  release?.();
  await expect(
    page.getByText("No help locations returned", { exact: true }),
  ).toBeVisible();
});

test("Community loads the station layer instead of a permanent not-loaded state", async ({
  page,
}) => {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  let transportRequests = 0;
  await page.route(
    "**/api/public/transport?area=hounslow_town_centre",
    async (route) => {
      transportRequests++;
      const now = new Date().toISOString();
      await route.fulfill({
        json: {
          schemaVersion: "1.0",
          synthetic: false,
          generatedAt: now,
          coverage: [],
          data: {
            pilotId: "hounslow_town_centre",
            sourceId: "TFL-UNIFIED",
            status: "available",
            synthetic: false,
            fetchedAt: now,
            observedAt: null,
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            sourceUrl: "https://api.tfl.gov.uk",
            sourceLabel: "Powered by TfL Open Data",
            limitations: ["Reference point only."],
            lines: [],
            stations: [
              {
                id: "940GZZLUHWC",
                name: "Test station reference",
                pilotId: "hounslow_town_centre",
                coordinates: [51.4683, -0.3618],
                coordinateMeaning: "station_reference",
                status: "unknown",
                availability: "unknown",
                retrievalStatus: "available",
                description: "Test reference only.",
                fetchedAt: now,
                observedAt: null,
                sourceUrl: "https://api.tfl.gov.uk",
                sourceLabel: "Powered by TfL Open Data",
              },
            ],
          },
        },
      });
    },
  );
  await page.goto("/?public=1&area=hounslow_town_centre");
  await expect(
    page.getByRole("combobox", { name: "Choose pilot area" }),
  ).toBeEnabled();
  await page
    .getByRole("tab", { name: "Community reports", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Test station reference Transport",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Transport data has not loaded.", { exact: true }),
  ).toHaveCount(0);
  expect(transportRequests).toBeGreaterThan(0);
});
