import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route("**/*.tile.openstreetmap.org/**", (route) => route.abort());
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.route(/https:\/\/[^/]*tile\.openstreetmap\.org\//, (route) =>
    route.abort(),
  );
  await page.goto(process.env.RESEARCH_TEST_URL || "http://127.0.0.1:4186");
  await page
    .getByRole("button", { name: "Research", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Community research", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Broadcast updates are not member observations.", {
      exact: true,
    }),
  ).toBeVisible();
  const navRows = await page
    .locator(".mobile-nav button")
    .evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
    );
  assert.equal(
    new Set(navRows).size,
    1,
    "Mobile navigation must stay on one row.",
  );
  const form = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save fictional observation" }),
  });
  for (let index = 0; index < 3; index++) {
    await form.getByRole("checkbox", { name: "lighting", exact: true }).check();
    await form
      .getByRole("checkbox", {
        name: "This observation is fictional.",
        exact: true,
      })
      .check();
    await form
      .getByRole("checkbox", {
        name: "I agree to this temporary research exercise.",
        exact: true,
      })
      .check();
    await form
      .getByRole("checkbox", {
        name: "Include this observation in fictional aggregate coverage.",
        exact: true,
      })
      .check();
    await form
      .getByRole("button", { name: "Save fictional observation", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Withdraw observation", exact: true }),
    ).toHaveCount(index + 1);
  }
  await expect(
    page.getByText("3 eligible fictional observations", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Withdraw observation", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Withdrawn observation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("3 eligible fictional observations", { exact: true }),
  ).toHaveCount(0);
  for (const pilot of ["camden_town", "west_croydon"]) {
    await page
      .getByLabel("Choose pilot area", { exact: true })
      .selectOption(pilot);
    await expect(
      form.getByRole("combobox", { name: "Recruitment source", exact: true }),
    ).toHaveValue(`${pilot}_join`);
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Mobile layout must not overflow.",
  );
  await form
    .getByRole("combobox", { name: "Recruitment source", exact: true })
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    form.getByRole("combobox", { name: "Approximate landmark", exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Choose demo persona", { exact: true })
    .selectOption("moderator");
  await expect(
    page.getByText("Select Alex or Sam to try the fictional form.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdraw observation", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Choose demo persona", { exact: true })
    .selectOption("sam");
  await expect(
    page.getByText("No observations in this exercise.", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("heading", { name: "Community research", exact: true }),
  ).toBeVisible();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Desktop layout must not overflow.",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: research submission, consented coverage, withdrawal, three areas, persona reset, keyboard, mobile, desktop.",
  );
} finally {
  await browser.close();
}
