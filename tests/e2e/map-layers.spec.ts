import { test, expect, type Page } from "@playwright/test";
import { areas } from "../../packages/contracts/index";
const provenance = () => ({
  sourceUrl: "https://api.tfl.gov.uk/Line/northern/Status",
  sourceLabel: "Powered by TfL Open Data",
  observedAt: null,
  fetchedAt: new Date().toISOString(),
});
function snapshot(pilotId: string, expired = false) {
  const p = provenance();
  return {
    ...p,
    pilotId,
    status: "available",
    sourceId: "TFL-UNIFIED",
    synthetic: false,
    expiresAt: new Date(Date.now() + (expired ? -60000 : 300000)).toISOString(),
    fetchedAt: new Date(Date.now() - (expired ? 120000 : 0)).toISOString(),
    limitations: [
      "Whole-line information does not establish local conditions.",
    ],
    stations: [
      {
        ...p,
        id: "940GZZLUCTN",
        name: `${pilotId} station`,
        pilotId,
        coordinates: [51.5392, -0.1426],
        coordinateMeaning: "station_reference",
        status: "unknown",
        description: "No station availability confirmed.",
        availability: "unknown",
        retrievalStatus: "available",
      },
    ],
    lines: [
      {
        ...p,
        id: "northern",
        name: "Northern",
        status: "reported",
        description: "Minor delays",
        scope: "whole_line",
      },
    ],
  };
}
function cameras(pilotId: string) {
  const p = provenance();
  return {
    ...p,
    pilotId,
    status: "available",
    sourceId: "TFL-UNIFIED",
    synthetic: false,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    limitations: ["Traffic camera metadata only."],
    scope: "one_mile_research_circle",
    cameras: [
      {
        ...p,
        id: "JamCams_00001.1",
        name: `${pilotId} traffic camera`,
        pilotId,
        coordinates: [51.54, -0.143],
        coordinateMeaning: "camera_reference",
        status: "metadata_only",
        availability: "unknown",
      },
    ],
  };
}
const envelope = (data: unknown) => ({
  schemaVersion: "1.0",
  synthetic: false,
  generatedAt: new Date().toISOString(),
  data,
  coverage: [],
});
async function mocks(page: Page, expired = false) {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  await page.route("**/api/public/**", async (r) => {
    const u = new URL(r.request().url());
    const area = u.searchParams.get("area") ?? "camden_town";
    const endpoint = u.pathname.split("/").pop();
    let data: unknown = [];
    if (endpoint === "areas") data = areas;
    else if (endpoint === "transport") data = snapshot(area, expired);
    else if (endpoint === "traffic-cameras") data = cameras(area);
    else if (endpoint === "help")
      data = [
        {
          id: "help-" + area,
          pilotId: area,
          name: area + " council help",
          summary: "Council listing.",
          url: "https://www.camden.gov.uk/safe-havens",
          availability: "unconfirmed",
          schedule: null,
          coordinates: [51.539, -0.141],
        },
      ];
    else if (endpoint === "history")
      data = {
        status: "boundary_review_required",
        estimate: null,
        explanation: "Boundaries need review.",
      };
    await r.fulfill({ json: envelope(data) });
  });
}
test("layer filters and shared selection work when map tiles fail", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/?public=1&area=camden_town");
  await expect(
    page.getByRole("heading", { name: "Camden Town", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Minor delays", { exact: false }).first(),
  ).toBeVisible();
  const browser = page.locator(".local-map-browser");
  await browser
    .getByRole("button", { name: "Traffic cameras", exact: true })
    .click();
  await expect(
    browser.getByText("camden_town traffic camera", { exact: true }).first(),
  ).toBeVisible();
  await browser
    .getByRole("button", { name: "Help locations", exact: true })
    .click();
  await expect(
    browser
      .locator(".local-map-list")
      .getByText("camden_town council help", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Choose pilot area").selectOption("west_croydon");
  await expect(
    browser.getByText("west_croydon station", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    browser.getByText("camden_town station", { exact: true }),
  ).toHaveCount(0);
});
test("mobile list remains usable without map and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await mocks(page);
  await page.goto("/?public=1&area=hounslow_town_centre");
  const browser = page.locator(".local-map-browser");
  await expect(
    browser.getByRole("button", { name: "Help locations", exact: true }),
  ).toBeVisible();
  await expect(browser.locator(".map-shell")).not.toBeVisible();
  await expect(
    browser
      .getByText("hounslow_town_centre council help", { exact: true })
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("expired transport never appears current and refresh failure stays explicit", async ({
  page,
}) => {
  await mocks(page, true);
  await page.goto("/?public=1&area=camden_town");
  await expect(page.locator(".transport-panel")).toContainText(
    /expired|out of date|stale/i,
  );
  await page.route("**/api/public/transport?*", (r) =>
    r.fulfill({ status: 503, json: { error: { message: "Unavailable" } } }),
  );
  await page.getByRole("button", { name: /refresh transport/i }).click();
  await expect(page.locator(".transport-panel")).toContainText(
    /unavailable|failed/i,
  );
});
test("keyboard list selection and marker selection open the same detail", async ({
  page,
}) => {
  await mocks(page);
  await page.route(/tile\.openstreetmap\.org/, (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/?public=1&area=camden_town");
  const browser = page.locator(".local-map-browser");
  const row = browser
    .locator(".local-map-list")
    .getByRole("button", { name: /camden_town council help/ });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(
    browser.getByRole("region", { name: "camden_town council help details" }),
  ).toBeVisible();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await browser.getByRole("button", { name: "Close location details" }).click();
  await browser
    .getByRole("button", {
      name: "camden_town council help, council-listed help location",
      exact: true,
    })
    .click();
  await expect(
    browser.getByRole("region", { name: "camden_town council help details" }),
  ).toBeVisible();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: ".data/map-layers-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".data/map-layers-mobile.png",
    fullPage: true,
  });
});
test("map and panel expire without another source response", async ({
  page,
}) => {
  await mocks(page);
  let requests = 0;
  await page.route("**/api/public/transport?*", (r) => {
    requests++;
    if (requests > 1) return; // Keep the refresh pending to verify expiry remains visible.
    const data = snapshot("camden_town");
    data.expiresAt = new Date(Date.now() + 1800).toISOString();
    data.stations[0]!.description = "Station warning from operator.";
    return r.fulfill({ json: envelope(data) });
  });
  await page.goto("/?public=1&area=camden_town");
  const browser = page.locator(".local-map-browser");
  await browser
    .locator(".local-map-list")
    .getByRole("button", { name: /camden_town station/ })
    .click();
  await expect(
    browser.getByRole("region", { name: "camden_town station details" }),
  ).toContainText("Station warning from operator.");
  await expect(page.locator(".transport-panel")).toContainText(
    "Transport snapshot expired.",
  );
  await expect(
    browser.getByRole("region", { name: "camden_town station details" }),
  ).toContainText("Service status unknown.");
  await expect.poll(() => requests).toBe(2);
});

test("refreshes a nearly expired transport cache response at its expiry", async ({
  page,
}) => {
  await mocks(page);
  let requests = 0;
  await page.route("**/api/public/transport?*", (route) => {
    requests++;
    const data = snapshot("camden_town");
    if (requests === 1) {
      data.fetchedAt = new Date(Date.now() - 28800).toISOString();
      data.expiresAt = new Date(Date.now() + 1200).toISOString();
      data.lines[0]!.description = "Earlier operator report.";
    } else {
      data.lines[0]!.description = "Refreshed operator report.";
    }
    return route.fulfill({ json: envelope(data) });
  });
  await page.goto("/?public=1&area=camden_town");
  await expect(page.locator(".transport-panel")).toContainText(
    "Earlier operator report.",
  );
  await expect(page.locator(".transport-panel")).toContainText(
    "Refreshed operator report.",
    { timeout: 5000 },
  );
  expect(requests).toBe(2);
});

test("spaces retries when transport repeatedly returns an expired snapshot", async ({
  page,
}) => {
  await mocks(page);
  const requestTimes: number[] = [];
  await page.route("**/api/public/transport?*", (route) => {
    requestTimes.push(Date.now());
    return route.fulfill({ json: envelope(snapshot("camden_town", true)) });
  });
  await page.goto("/?public=1&area=camden_town");
  await expect(page.locator(".transport-panel")).toContainText(
    "Transport snapshot expired.",
  );
  await expect
    .poll(() => requestTimes.length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(3);
  for (let index = 1; index < requestTimes.length; index++)
    expect(
      requestTimes[index] - requestTimes[index - 1],
    ).toBeGreaterThanOrEqual(900);
  expect(requestTimes[2] - requestTimes[1]).toBeGreaterThanOrEqual(1900);
  expect(requestTimes.length).toBeLessThanOrEqual(4);
  await expect(page.locator(".transport-panel")).toContainText(
    "Transport snapshot expired.",
  );
});

test("keeps refreshed source failures explicit instead of extending expired reports", async ({
  page,
}) => {
  await mocks(page);
  let requests = 0;
  await page.route("**/api/public/transport?*", (route) => {
    requests++;
    if (requests > 1)
      return route.fulfill({
        status: 503,
        json: {
          schemaVersion: "1.0",
          error: {
            code: "source_unavailable",
            message: "Transport unavailable",
          },
        },
      });
    const data = snapshot("camden_town");
    data.expiresAt = new Date(Date.now() + 1200).toISOString();
    data.lines[0]!.description = "Earlier operator report.";
    return route.fulfill({ json: envelope(data) });
  });
  await page.goto("/?public=1&area=camden_town");
  await expect(page.locator(".transport-panel")).toContainText(
    "Earlier operator report.",
  );
  await expect(page.locator(".transport-panel")).toContainText(
    "Transport status is unavailable.",
    { timeout: 5000 },
  );
  await expect(page.locator(".transport-panel")).not.toContainText(
    "Earlier operator report.",
  );
  expect(requests).toBe(2);
});
