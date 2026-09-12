import { expect, test } from "@playwright/test";
for (const width of [390, 1440])
  test(`fictional research review persists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.request.post("/api/session", { data: { persona: "moderator" } });
    await page.goto("/?workspace=analysis&demo=1&area=camden_town");
    await expect(
      page.getByRole("heading", { name: "Real data: insufficient history" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Run fictional comparison" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Invented demonstration data" }),
    ).toBeVisible();
    await page
      .getByLabel("Review note")
      .fill("Reviewed the fictional method and interpretation limits.");
    await page.getByRole("button", { name: "Approve demonstration" }).click();
    await expect(
      page.getByText(
        "Review note: Reviewed the fictional method and interpretation limits.",
      ),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(
        "Review note: Reviewed the fictional method and interpretation limits.",
      ),
    ).toBeVisible();
    await page
      .getByText("Aligned fictional observations", { exact: true })
      .click();
    await expect(page.getByRole("table")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export fictional inputs and result" })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toContain("fictional-analysis");
  });
test("locks the area selector during a delayed reload", async ({ page }) => {
  let camdenRequests = 0;
  await page.route("**/api/analytics?area=*", async (route) => {
    const area = new URL(route.request().url()).searchParams.get("area");
    if (area === "camden_town" && ++camdenRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Research temporarily unavailable." },
        }),
      });
      return;
    }
    if (area === "camden_town")
      await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: { revision: area === "camden_town" ? 2 : 7, runs: [] },
      }),
    });
  });
  await page.goto("/?demo=1&workspace=analysis");
  await expect(page.getByRole("alert")).toContainText(
    "Research temporarily unavailable.",
  );
  await page.getByRole("button", { name: "Reload research" }).click();
  await expect(page.getByRole("combobox")).toBeDisabled();
  await expect(page.getByRole("combobox")).toBeEnabled();
  await page.getByRole("combobox").selectOption("west_croydon");
  await expect(
    page.getByRole("button", { name: "Run fictional comparison" }),
  ).toBeEnabled();
  await expect(page.getByRole("combobox")).toHaveValue("west_croydon");
});
