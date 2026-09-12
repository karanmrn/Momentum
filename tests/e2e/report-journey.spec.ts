import { expect, test } from "@playwright/test";

for (const width of [320, 1440]) {
  test(`private report journey retains context at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/?demo=1&workspace=community&area=camden_town&returnTo=presentation&slide=4",
    );
    await page
      .getByRole("navigation", { name: "Community sections" })
      .getByRole("button", { name: "Share observation", exact: true })
      .click();
    await page
      .getByRole("radio", { name: "Access barrier", exact: true })
      .check();
    const title = `Fictional journey ${width}`;
    await page.getByLabel("Short title", { exact: true }).fill(title);
    await page
      .getByLabel("Approximate public place", { exact: true })
      .fill("Camden station approach");
    await page
      .getByLabel("Factual narrative (optional)", { exact: true })
      .fill("PRIVATE_JOURNEY_SENTINEL stays private.");
    await page
      .getByRole("button", { name: "Review observation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review before saving", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Back to fields", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", {
        name: "Factual narrative (optional)",
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Review observation", exact: true })
      .click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/community-workflow/reports") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Confirm private submission", exact: true })
      .click();
    const saved = (await (await response).json()).data;
    expect(saved.intake.category).toBe("access");
    const receipt = page.getByRole("region", {
      name: "Private report receipt",
    });
    await expect(receipt.getByRole("heading", { name: title })).toBeVisible();
    const journey = receipt.getByRole("navigation", { name: "Report journey" });
    await journey
      .getByRole("button", { name: "Evidence", exact: true })
      .click();
    await expect(
      receipt.getByText("PRIVATE_JOURNEY_SENTINEL stays private."),
    ).toBeHidden();
    const graph = receipt.getByRole("link", {
      name: "Open area graph (new tab)",
    });
    await expect(graph).toHaveAttribute(
      "href",
      "/?public=1&workspace=graph&area=camden_town",
    );
    await expect(graph).toHaveAttribute("rel", "noopener noreferrer");
    const popupEvent = page.waitForEvent("popup");
    await graph.click();
    const popup = await popupEvent;
    await popup.waitForLoadState("domcontentloaded");
    expect(popup.url()).not.toContain(saved.id);
    expect(popup.url()).not.toContain("PRIVATE_JOURNEY_SENTINEL");
    await popup.close();
    await journey.getByRole("button", { name: "Changes", exact: true }).click();
    await expect(
      receipt.getByRole("heading", { name: "Private status history" }),
    ).toBeVisible();
    await expect(receipt.locator(".cw-history")).toContainText("submitted");
    await expect(
      receipt.getByRole("link", { name: "Get help (new tab)" }),
    ).toHaveAttribute("href", "/?public=1&tab=help&area=camden_town");
    await journey.getByRole("button", { name: "Report", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      receipt.getByText("PRIVATE_JOURNEY_SENTINEL stays private."),
    ).toBeVisible();
    await expect(
      receipt.getByRole("button", { name: "Correct observation" }),
    ).toBeEnabled();
    await expect(
      receipt.getByRole("button", { name: "Withdraw observation" }),
    ).toBeEnabled();
    await receipt
      .getByRole("button", { name: "View report in graph", exact: true })
      .click();
    await expect(
      page.getByText("Your report graph", { exact: true }),
    ).toBeVisible();
    const selectedReport = page.locator('.gc-node[aria-pressed="true"]');
    await expect(selectedReport).toHaveAttribute(
      "aria-label",
      `Inspect ${title}, PrivateObservation, fictional`,
    );
    await expect
      .poll(async () => {
        const circle = await selectedReport
          .locator(".gc-node-shape")
          .boundingBox();
        const viewport = await page.locator(".gc-viewport").boundingBox();
        if (!circle || !viewport) return false;
        const horizontalAnchor = viewport.width < 540 ? 0.5 : 0.38;
        return (
          Math.abs(
            circle.x +
              circle.width / 2 -
              viewport.x -
              viewport.width * horizontalAnchor,
          ) < 3 &&
          Math.abs(
            circle.y + circle.height / 2 - viewport.y - viewport.height * 0.38,
          ) < 3
        );
      })
      .toBe(true);
    expect(page.url()).not.toContain(saved.report.id);
    expect(page.url()).toContain("returnTo=presentation");
    expect(page.url()).toContain("slide=4");
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Back to My reports", exact: true })
      .click();
    await expect(
      receipt.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
