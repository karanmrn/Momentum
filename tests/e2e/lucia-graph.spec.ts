import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`Source selection and transient arrangement at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?workspace=graph&public=1&area=camden_town");
    const node = page.locator(".gc-node").first();
    await expect(node).toBeVisible();
    await node.focus();
    await page.keyboard.press("Enter");
    await expect(node).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("complementary", { name: "Selected source summary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Compare this record" }),
    ).toBeVisible();
    const summary = page.getByRole("complementary", {
      name: "Selected source summary",
    });
    await summary.focus();
    await expect(summary).toBeFocused();
    await page
      .locator(".graph-canvas")
      .screenshot({ path: `/tmp/lucia-graph-${width}.png` });
    await node.scrollIntoViewIfNeeded();
    const before = await node.getAttribute("transform");
    const edgeBefore = await page
      .locator(".gc-edge-line")
      .evaluateAll((elements) => elements.map((el) => el.getAttribute("d")));
    const center = await node.locator(".gc-node-shape").boundingBox();
    if (!center) throw new Error("Missing node shape");
    await page.mouse.move(
      center.x + center.width / 2,
      center.y + center.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      center.x + center.width / 2 + 35,
      center.y + center.height / 2 + 25,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(node).not.toHaveAttribute("transform", before!);
    expect(
      await page
        .locator(".gc-edge-line")
        .evaluateAll((elements) => elements.map((el) => el.getAttribute("d"))),
    ).not.toEqual(edgeBefore);
    await page.getByRole("group", { name: "Interactive area graph" }).focus();
    await page.keyboard.press("0");
    await expect(node).toHaveAttribute("transform", before!);
    await page.getByRole("button", { name: "Fit graph" }).click();
    await expect(node).toHaveAttribute("transform", before!);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.getByLabel("Search graph").fill("unmatched-record-xyz");
    await expect(
      page.getByText("No records in this view", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Selected source summary" }),
    ).toHaveCount(0);
    await page.getByLabel("Search graph").clear();
    await expect(node).toHaveAttribute("transform", before!);
  });
}
