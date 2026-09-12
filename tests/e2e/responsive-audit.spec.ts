import { expect, test } from "@playwright/test";

const viewports = [320, 390, 768, 821, 903, 1024, 1280, 1440];

test("keeps the local information layout within every supported viewport", async ({
  page,
}) => {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Hounslow", exact: true }),
    ).toBeVisible();

    const layout = await page.evaluate(() => {
      const box = (selector: string) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement))
          throw new Error(`Missing ${selector}`);
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        scrollWidth: document.documentElement.scrollWidth,
        map: box(".now-layout .map-panel"),
        sources: box(".now-layout .source-panel"),
      };
    });

    expect(layout.scrollWidth, `${width}px must not clip content`).toBe(width);

    if (width >= 821 && width < 1120) {
      expect(layout.sources.x).toBe(layout.map.x);
      expect(layout.sources.y).toBeGreaterThan(layout.map.y);
    }
    if (width >= 1120) {
      expect(layout.sources.x).toBeGreaterThan(layout.map.x);
      expect(layout.sources.y).toBe(layout.map.y);
    }
  }
});

test("puts the compact mobile account control beside the brand", async ({
  page,
}) => {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Hounslow", exact: true }),
  ).toBeVisible();

  const header = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement))
        throw new Error(`Missing ${selector}`);
      const { x, y, height } = element.getBoundingClientRect();
      return { x, y, height };
    };
    return {
      brand: box(".mobile-brand"),
      account: box(".topbar > .button.secondary"),
      area: box(".area-control"),
    };
  });

  expect(header.account.x).toBeGreaterThan(header.brand.x);
  expect(header.account.y + header.account.height / 2).toBe(
    header.brand.y + header.brand.height / 2,
  );
  expect(header.area.y).toBeGreaterThan(header.account.y);
});

test("keeps tablet header controls separate in public and demo browsing", async ({
  page,
}) => {
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());

  for (const path of ["/?demo=1", "/?public=1&area=hounslow_town_centre"]) {
    for (const width of [821, 903, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("heading", { name: "Hounslow", exact: true }),
      ).toBeVisible();

      const controls = await page
        .locator(
          ".topbar > .button.secondary, .topbar .area-control, .topbar .persona, .topbar .public-actions > button, .topbar .public-actions > a",
        )
        .evaluateAll((elements) =>
          elements
            .map((element) => {
              const { x, y, width, height } = element.getBoundingClientRect();
              return { x, y, width, height };
            })
            .filter((box) => box.width > 0 && box.height > 0),
        );

      for (let index = 0; index < controls.length; index += 1) {
        for (let other = index + 1; other < controls.length; other += 1) {
          const first = controls[index];
          const second = controls[other];
          const overlap =
            first.x < second.x + second.width &&
            first.x + first.width > second.x &&
            first.y < second.y + second.height &&
            first.y + first.height > second.y;
          expect(
            overlap,
            `${path} at ${width}px has overlapping header controls`,
          ).toBe(false);
        }
      }
    }
  }
});
