import { expect, test } from "@playwright/test";

test("the supplied deck renders all ten slides and preserves its place on reload", async ({
  page,
}) => {
  await page.goto("/?public=1&presentation=1&area=camden_town&slide=1");
  await expect(page.getByRole("heading", { name: "Pitch deck" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous slide" }),
  ).toBeDisabled();
  for (let slide = 1; slide <= 10; slide++) {
    const image = page.getByRole("img", {
      name: `Momentum pitch deck, slide ${slide}. Full text below.`,
    });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(1000);
    await expect(
      page.getByText(`Slide ${slide} of 10`, { exact: true }),
    ).toBeVisible();
    if (slide < 10)
      await page.getByRole("button", { name: "Next slide" }).click();
  }
  await expect(page.getByRole("button", { name: "Next slide" })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("Slide 10 of 10", { exact: true })).toBeVisible();
  await page.getByText("Slide text", { exact: true }).click();
  await expect(
    page.getByText(/14 new streetlights installed this month/),
  ).toBeVisible();
});

test("presentation journey links preserve the town and return slide at phone and desktop widths", async ({
  page,
}) => {
  await page.goto("/?public=1&presentation=1&area=west_croydon&slide=6");
  for (const [name, tab] of [
    ["Town updates", "now"],
    ["Police records", "history"],
    ["Community reports", "community"],
  ]) {
    const href = await page
      .getByRole("link", { name, exact: true })
      .getAttribute("href");
    const url = new URL(href!, page.url());
    expect(url.searchParams.get("area")).toBe("west_croydon");
    expect(url.searchParams.get("tab")).toBe(tab);
    expect(url.searchParams.get("returnTo")).toBe("presentation");
    expect(url.searchParams.get("slide")).toBe("6");
    expect(url.searchParams.has("presentation")).toBe(false);
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width >= 1000 ? 900 : 1000 });
    if (width >= 1000) {
      const controls = await page
        .getByRole("button", { name: "Next slide" })
        .boundingBox();
      expect(controls!.y + controls!.height).toBeLessThanOrEqual(900);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/pitch-deck-${width}.png`,
      fullPage: true,
    });
  }
});

test("invalid slide input starts at the first slide", async ({ page }) => {
  await page.goto(
    "/?public=1&presentation=1&area=hounslow_town_centre&slide=999",
  );
  await expect(page.getByText("Slide 1 of 10", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Slide 2 of 10", { exact: true })).toBeVisible();
});

test("police and community journeys return to the same town and slide", async ({
  page,
}) => {
  for (const label of ["Police records", "Community reports"]) {
    await page.goto("/?public=1&presentation=1&area=west_croydon&slide=6");
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(
      page.getByRole("tab", { name: label, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Choose pilot area")).toHaveValue(
      "west_croydon",
    );
    await page
      .getByRole("link", { name: "Back to presentation", exact: true })
      .click();
    await expect(
      page.getByText("Slide 6 of 10", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/area=west_croydon/);
  }
});

test("the local fictional report trial returns to the presentation", async ({
  page,
}) => {
  await page.goto("/?public=1&presentation=1&area=camden_town&slide=6");
  await page.getByRole("link", { name: "Report trial", exact: true }).click();
  await expect(page).toHaveURL(/workspace=community/);
  await expect(
    page.getByRole("heading", { name: "Community workspace", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to area", exact: true }).click();
  await expect(page.getByText("Slide 6 of 10", { exact: true })).toBeVisible();
});
