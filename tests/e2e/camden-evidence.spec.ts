import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("Camden evidence entry, source limits, correction and withdrawal work", async ({
  page,
  baseURL,
}) => {
  await page.goto("/?public=1&area=camden_town");
  await page.getByRole("tab", { name: "Police records", exact: true }).click();
  await page
    .getByRole("link", { name: "Explore Camden evidence example", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "What can each source tell us?",
      exact: true,
    }),
  ).toBeVisible();
  execFileSync(process.execPath, ["tests/camden-evidence/browser.mjs"], {
    env: { ...process.env, CAMDEN_TEST_URL: `${baseURL}/?evidence=camden` },
    timeout: 30000,
    stdio: "pipe",
  });
  await page
    .getByRole("button", { name: "Back to Momentum", exact: true })
    .click();
  await expect(page.getByLabel("Choose pilot area")).toHaveValue("camden_town");
  await expect(page).not.toHaveURL(/evidence=camden/);
});
