import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixtures = JSON.parse(
  readFileSync(
    new URL("../../packages/community-demo/fixtures.json", import.meta.url),
    "utf8",
  ),
) as {
  scenarios: Array<{
    id: string;
    pilotId: string;
    publication: string;
    topic: string;
    title: string;
    description: string;
    place: string;
  }>;
};

test("scenario selection fills only reviewable local fiction and requires submission", async ({
  page,
}) => {
  await page.route(/https:\/\/[^/]*tile\.openstreetmap\.org\//, (route) =>
    route.abort(),
  );
  await page.route(/\/api\/public\/(transport|traffic-cameras)\?/, (route) =>
    route.abort(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  let submissions = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/reports"
    )
      submissions++;
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hounslow", exact: true }),
  ).toBeVisible();
  for (const pilotId of [
    "hounslow_town_centre",
    "camden_town",
    "west_croydon",
  ]) {
    await page.getByLabel("Choose pilot area").selectOption(pilotId);
    await expect(page.getByLabel("Choose pilot area")).toBeEnabled();
    await page
      .getByRole("button", { name: "Share observation", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const picker = dialog.getByLabel("Scenario for this area");
    const allowed = fixtures.scenarios.filter(
      (s) => s.pilotId === pilotId && s.publication === "reviewable",
    );
    await expect(picker.locator("option")).toHaveCount(allowed.length + 1);
    for (const scenario of fixtures.scenarios.filter(
      (s) => s.publication === "private_only" || s.pilotId !== pilotId,
    )) {
      await expect(
        picker.locator(`option[value="${scenario.id}"]`),
      ).toHaveCount(0);
    }
    const scenario = allowed.find((s) => s.topic === "environment")!;
    await picker.selectOption(scenario.id);
    await expect(dialog.getByLabel("Short title")).toHaveValue("");
    await dialog
      .getByRole("button", { name: "Use scenario", exact: true })
      .click();
    await expect(dialog.getByLabel("Short title")).toHaveValue(scenario.title);
    await expect(dialog.getByLabel("What you observed")).toHaveValue(
      scenario.description,
    );
    await expect(dialog.getByLabel("Approximate place")).toHaveValue(
      scenario.place,
    );
    await expect(dialog.getByRole("combobox", { name: /^Category/ })).toHaveValue(
      "infrastructure",
    );
    await expect(dialog.getByRole("status")).toHaveText(
      "Fictional fields filled. Nothing has been submitted.",
    );
    expect(submissions).toBe(0);
    await dialog
      .getByLabel("Short title")
      .fill("Fictional: Edited scenario for browser review");
    if (pilotId === "west_croydon") {
      await dialog
        .getByRole("button", { name: "Save for review", exact: true })
        .click();
      await expect(
        dialog.getByText("Saved for private review", { exact: true }),
      ).toBeVisible();
      expect(submissions).toBe(1);
    } else {
      await dialog
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
  }
});
