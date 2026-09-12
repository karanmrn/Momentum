import { expect, test } from "@playwright/test";

test("an unavailable community session retains an exit to the selected area", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.route("**/api/session", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { message: "The demo session could not load." },
      }),
    }),
  );
  await page.goto("/?public=1&workspace=community&area=camden_town");
  await expect(
    page.getByRole("button", { name: "Retry demo session" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(
    "The demo session could not load.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Back to Momentum" }).click();
  await expect(page).toHaveURL(/area=camden_town/);
  expect(new URL(page.url()).searchParams.has("workspace")).toBe(false);
  await expect(
    page.getByRole("heading", { name: "Camden Town", exact: true }),
  ).toBeVisible();
});
