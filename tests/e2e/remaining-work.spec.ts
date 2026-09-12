import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function screenshot(page: Page, name: string, width: number) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await mkdir(".data/remaining-work", { recursive: true });
  await page.screenshot({
    path: `.data/remaining-work/${name}-${width}.png`,
    fullPage: true,
  });
}
async function toolsLink(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Community tools", exact: true })
    .getByRole("link", { name, exact: true })
    .click();
}
for (const width of [320, 1440])
  test(`integrated community, preferences, graph and review navigation at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    page.setDefaultTimeout(10000);
    await page.setViewportSize({ width, height: 900 });
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.route(/https:\/\/[^/]*tile\.openstreetmap\.org\//, (route) =>
      route.abort(),
    );
    await page.route(/\/api\/public\/(transport|traffic-cameras)\?/, (route) =>
      route.abort(),
    );
    await page.goto("/?demo=1&area=camden_town");
    await toolsLink(page, "Report and review");
    await expect(
      page.getByRole("heading", { name: "Community workspace", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Community sections" })
      .getByRole("button", { name: "Share observation", exact: true })
      .click();
    await page
      .getByLabel("Short title", { exact: true })
      .fill(`Fictional integrated lighting observation ${width}`);
    await page
      .getByLabel("Approximate public place", { exact: true })
      .fill("Camden station approach");
    await page
      .getByRole("combobox", { name: "How you know", exact: true })
      .selectOption("other_source");
    await page
      .getByLabel("Other source description", { exact: true })
      .fill("PRIVATE_SOURCE_SENTINEL describes a fictional source.");
    await page
      .getByLabel("Factual narrative (optional)", { exact: true })
      .fill("PRIVATE_NARRATIVE_SENTINEL stays within private review.");
    await page
      .getByRole("combobox", { name: "Publication preference", exact: true })
      .selectOption("reviewed_public");
    await page
      .getByRole("button", { name: "Review observation", exact: true })
      .click();
    const createdEvent = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/community-workflow/reports") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Confirm private submission", exact: true })
      .click();
    const created = await (await createdEvent).json();
    expect(created.data.status).toBe("submitted");
    await expect(
      page.getByRole("region", { name: "Private report receipt" }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Demo persona", exact: true })
      .selectOption("moderator");
    await page
      .locator(".cw-record-list button")
      .filter({ hasText: `Fictional integrated lighting observation ${width}` })
      .click();
    await page
      .getByRole("combobox", { name: "Review decision", exact: true })
      .selectOption("approve");
    await page
      .getByLabel("Private review reason", { exact: true })
      .fill(
        "The fictional other-source account was checked for a public summary.",
      );
    await page
      .getByLabel("Public-safe summary", { exact: true })
      .fill(
        "A fictional other-source account describes reduced lighting. Current conditions remain unconfirmed.",
      );
    const reviewedEvent = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/reports/${created.data.id}/review`) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Save review decision", exact: true })
      .click();
    const reviewed = await (await reviewedEvent).json();
    expect(reviewed.data.status).toBe("published");
    const noticeId = reviewed.data.notice.id;
    await page
      .getByRole("navigation", { name: "Community sections" })
      .getByRole("button", { name: "Reviewed updates", exact: true })
      .click();
    await expect(page.locator(".cw-public")).toContainText("other source");
    await screenshot(page, "community", width);
    const graphResponse = await page.request.get("/api/graph?area=camden_town");
    expect(graphResponse.status()).toBe(200);
    const graph = (await graphResponse.json()).data;
    const noticeNode = graph.nodes.find(
      (node: { id: string }) => node.id === `notice:${noticeId}:revision:1`,
    );
    expect(noticeNode.metadata).toMatchObject({
      sourceKind: "community_other_source",
      observedAt: created.data.intake.observedFrom,
      observedTo: created.data.intake.observedTo,
      timePrecision: "time_window",
    });
    expect(JSON.stringify(graph)).not.toContain("PRIVATE_SOURCE_SENTINEL");
    expect(JSON.stringify(graph)).not.toContain(created.data.report.id);
    expect(JSON.stringify(graph)).not.toContain("PRIVATE_NARRATIVE_SENTINEL");
    const exportResponse = await page.request.get(
      "/api/graph/export?area=camden_town",
    );
    expect(exportResponse.status()).toBe(200);
    const exported = await exportResponse.json();
    expect(
      exported.nodes.find((node: { id: string }) => node.id === noticeNode.id)
        .metadata.metadata,
    ).toMatchObject(noticeNode.metadata);
    expect(exported.edges.length).toBeGreaterThan(0);
    await page
      .getByRole("combobox", { name: "Demo persona", exact: true })
      .selectOption("alex");
    await expect(
      page.getByText("Fictional member: alex · camden town", { exact: true }),
    ).toBeVisible();
    await toolsLink(page, "Personal preferences");
    await expect(
      page.getByRole("heading", { name: "Your updates", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Hounslow town centre", { exact: true }).uncheck();
    await page.getByLabel("Camden Town centre", { exact: true }).check();
    await page
      .getByRole("combobox", {
        name: "Preferred content language",
        exact: true,
      })
      .selectOption("pl");
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Preferences saved.");
    const legacyBefore = await page.request.get("/api/me/feed");
    expect(legacyBefore.status()).toBe(200);
    expect(
      (await legacyBefore.json()).data.some(
        (notice: { id: string }) => notice.id === noticeId,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Queue current updates", exact: true })
      .click();
    await expect(
      page.getByText("queued · queued", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mute this update", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Unmute", exact: true }),
    ).toBeVisible();
    const legacyAfter = await page.request.get("/api/me/feed");
    expect(
      (await legacyAfter.json()).data.some(
        (notice: { id: string }) => notice.id === noticeId,
      ),
    ).toBe(false);
    const dispatch = await page.request.post("/api/me/notifications/dispatch", {
      data: {},
    });
    expect(dispatch.status()).toBe(200);
    const receipts = (await dispatch.json()).data;
    const mutedReceipts = receipts.filter(
      (item: { noticeId: string }) => item.noticeId === noticeId,
    );
    expect(mutedReceipts).toHaveLength(1);
    expect(mutedReceipts[0].state).toBe("suppressed");
    await page.reload();
    await expect(
      page.getByRole("combobox", {
        name: "Preferred content language",
        exact: true,
      }),
    ).toHaveValue("pl");
    await expect(
      page.getByRole("button", { name: "Unmute", exact: true }),
    ).toBeVisible();
    await screenshot(page, "preferences", width);
    await page
      .getByRole("button", { name: "Back to Momentum", exact: true })
      .click();
    await toolsLink(page, "Relation review");
    await expect(
      page.getByRole("heading", {
        name: "Momentum relation review",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Use demo moderator", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Load four fictional examples",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Fictional examples loaded",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Generate candidates", exact: true })
      .click();
    const candidates = page.locator(".rr-candidates button");
    await expect(candidates.first()).toBeVisible();
    await candidates.first().click();
    await expect(
      page.getByRole("heading", { name: "Inspect candidate", exact: true }),
    ).toBeVisible();
    await screenshot(page, "relations", width);
    await page
      .getByRole("button", { name: "Back to website", exact: true })
      .click();
    await toolsLink(page, "Research comparisons");
    await expect(
      page.getByRole("heading", { name: "Research comparisons", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Real data: insufficient history",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Run fictional comparison",
        exact: true,
      }),
    ).toBeEnabled();
    await screenshot(page, "analysis", width);
    expect(failures).toEqual([]);
  });
