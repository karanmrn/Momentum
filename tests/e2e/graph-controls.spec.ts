import { test, expect } from "@playwright/test";

for (const width of [320, 1440]) {
  test(`graph controls filter and zoom without losing evidence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?public=1&area=camden_town");
    await page
      .getByRole("tab", { name: "Police records", exact: true })
      .click();
    const graph = page.getByRole("region", {
      name: "Evidence graph",
      exact: true,
    });
    const network = graph.getByRole("region", {
      name: "Connected evidence",
      exact: true,
    });
    await expect(network.locator(".en-node").first()).toBeVisible();
    const originalCount = await network.locator(".en-node").count();
    await network.getByRole("button", { name: "Zoom in", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      network.getByRole("status", { name: "Graph zoom" }),
    ).toHaveText("125%");
    for (let step = 0; step < 3; step++)
      await network
        .getByRole("button", { name: "Zoom in", exact: true })
        .click();
    await expect(
      network.getByRole("button", { name: "Zoom in", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await network
      .getByRole("button", { name: "Reset zoom", exact: true })
      .click();
    await expect(
      network.getByRole("status", { name: "Graph zoom" }),
    ).toHaveText("100%");
    await network.locator(".en-node").first().click();
    const details = network.getByRole("region", {
      name: "Selected evidence details",
    });
    const selectedText = await details.textContent();
    await network
      .getByRole("combobox", { name: "Record type", exact: true })
      .selectOption("Source");
    await expect
      .poll(() => network.locator(".en-node").count())
      .toBeLessThan(originalCount);
    expect(await network.locator(".en-node span").allTextContents()).toEqual(
      expect.arrayContaining([expect.stringContaining("Source")]),
    );
    await expect(details).toHaveText(selectedText!);
    await network
      .getByRole("combobox", { name: "Record type", exact: true })
      .selectOption("");
    const source = network.getByRole("combobox", {
      name: "Source family",
      exact: true,
    });
    await source.selectOption({ index: 1 });
    await network.getByRole("button", { name: "Records", exact: true }).click();
    await expect(network.locator(".en-records li").first()).toBeVisible();
    await network
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await expect(network.locator(".en-records li")).toHaveCount(originalCount);
    await expect(graph.getByRole("table")).toBeVisible();
    await network.getByRole("button", { name: "Network", exact: true }).click();
    await network.screenshot({
      path: `.data/graph-controls-results/graph-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
