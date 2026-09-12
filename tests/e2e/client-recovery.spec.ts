import { test, expect } from "@playwright/test";

test("malformed dataset responses show unavailable state and support retry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*.tile.openstreetmap.org/**", (route) => route.abort());
  let broken = true;
  await page.route("**/api/public/datasets?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: broken ? "text/html" : "application/json",
      body: broken
        ? "<html>Unexpected proxy response</html>"
        : JSON.stringify({
            schemaVersion: "1.0",
            synthetic: false,
            generatedAt: new Date().toISOString(),
            coverage: [],
            data: [],
          }),
    }),
  );
  await page.goto("/?public=1");
  await page
    .getByRole("tab", { name: "Historical context", exact: true })
    .click();
  await expect(
    page.getByText("Dataset coverage is unavailable.", { exact: true }),
  ).toBeVisible();
  broken = false;
  await page
    .getByRole("button", { name: "Retry coverage", exact: true })
    .click();
  await expect(
    page.getByText("No acquisition snapshot is available for this area.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
