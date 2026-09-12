import { expect, test } from "@playwright/test";

for (const width of [320, 1440]) {
  test(`private report journey retains context at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?demo=1&workspace=community&area=camden_town");
    await page
      .getByRole("navigation", { name: "Community sections" })
      .getByRole("button", { name: "Share observation", exact: true })
      .click();
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
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/community-workflow/reports") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Confirm private submission", exact: true })
      .click();
    const saved = (await (await response).json()).data;
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
