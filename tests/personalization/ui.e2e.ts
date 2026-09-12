import { expect, test } from "@playwright/test";
for (const width of [320, 390, 1440])
  test(`persists choices and supports the inbox at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your updates", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save preferences", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Preferred content language").selectOption("pl");
    await page.getByLabel("Monthly historical coverage digest").check();
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Preferences saved.");
    await page.reload();
    await expect(page.getByLabel("Preferred content language")).toHaveValue(
      "pl",
    );
    await expect(
      page.getByLabel("Monthly historical coverage digest"),
    ).toBeChecked();
    await expect(
      page.getByText("You follow this area.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Queue current updates", exact: true })
      .click();
    await expect(
      page.getByText("queued · queued", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Check queued updates", exact: true })
      .click();
    await expect(
      page.getByText("delivered · delivered", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mute this update", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Unmute", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("No current fictional notices match these settings.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const screenshot = `/tmp/momentum-preferences-${width}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    await page
      .getByRole("button", {
        name: "Delete preferences and inbox",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Your saved preferences and inbox were deleted.",
    );
    await page.reload();
    await expect(
      page.getByLabel("In-app updates", { exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByText("No updates have been queued.", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
test("preserves a draft after another tab changes saved preferences", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Preferred content language")).toHaveValue("en");
  await page.getByLabel("Preferred content language").selectOption("fr");
  await page.evaluate(async () => {
    const result = await (await fetch("/api/personalization")).json();
    await fetch("/api/personalization", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: result.data.preferences.revision,
        settings: { ...result.data.preferences.settings, language: "pl" },
      }),
    });
  });
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Your draft is preserved.",
  );
  await expect(page.getByLabel("Preferred content language")).toHaveValue("fr");
  await page
    .getByRole("button", { name: "Replace latest with my draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Preferences saved.");
  await page.reload();
  await expect(page.getByLabel("Preferred content language")).toHaveValue("fr");
});
