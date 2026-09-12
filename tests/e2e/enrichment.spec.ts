import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("data context preserves all entry routes and exports source metadata", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/?public=1&area=camden_town");
  await page
    .getByRole("tab", { name: "Historical context", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Explore data context", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Connect the evidence", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Area", exact: true }),
  ).toHaveValue("camden_town");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download source metadata", exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const result = JSON.parse(await readFile(path!, "utf8"));
  expect(result.scope).toBe("historical_context_metadata");
  expect(result.pilotId).toBe("camden_town");
  expect(result.records.length).toBeGreaterThan(5);
  await page
    .getByRole("button", { name: "Community detail", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Correct fictional time", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Withdraw fictional account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Correct fictional time", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reset fictional exercise", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Correct fictional time", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Area", exact: true })
    .selectOption("west_croydon");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /^Back to / }).click();
  await expect(page.getByLabel("Choose pilot area")).toHaveValue(
    "west_croydon",
  );
  await page.goto("/?updates=1&area=camden_town");
  await expect(
    page.getByRole("heading", { name: "Local updates", exact: true }),
  ).toBeVisible();
  await page.goto("/?evidence=camden");
  await expect(
    page.getByRole("heading", {
      name: "What can each source tell us?",
      exact: true,
    }),
  ).toBeVisible();
});
