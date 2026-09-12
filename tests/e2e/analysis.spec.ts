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
