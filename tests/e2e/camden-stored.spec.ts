import { test, expect } from "@playwright/test";

test("Camden corrections survive reload and report submission enters private review", async ({
  page,
}) => {
  await page.goto("/?evidence=camden&area=camden_town");
  await expect(
    page.getByText("Saved study revision 1", { exact: false }),
  ).toBeVisible();
  const network = page.getByRole("region", {
    name: "Camden evidence network",
    exact: true,
  });
  await expect(network.locator("svg > path")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Correct fictional time", exact: true })
    .click();
  await expect(
    page.getByText(
      "Fictional state: corrected. Police source record unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Fictional state: corrected. Police source record unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  const saved = await page.request.get("/api/camden/examples");
  expect((await saved.json()).data.examples["CAM-01"]).toBe("corrected");
  await page
    .getByRole("button", { name: "Report this example", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Saved for private review" }),
  ).toBeVisible();
  const reports = (await (await page.request.get("/api/reports")).json()).data;
  const submitted = reports.find((report: { title: string }) =>
    report.title.includes("Fictional CAM-01"),
  );
  expect(submitted.status).toBe("submitted");
  const graph = (
    await (await page.request.get("/api/graph?area=camden_town")).json()
  ).data;
  expect(
    graph.nodes.filter(
      (node: { type: string }) => node.type === "PoliceRecord",
    ),
  ).toHaveLength(5);
  expect(JSON.stringify(graph)).not.toContain(submitted.id);
  await page
    .getByRole("button", { name: "Withdraw fictional account", exact: true })
    .click();
  await expect(
    page.getByText(
      "Fictional state: withdrawn. Police source record unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Fictional state: withdrawn. Police source record unchanged.",
      { exact: true },
    ),
  ).toBeVisible();
  const exported = await (
    await page.request.get("/api/graph/export?area=camden_town")
  ).json();
  expect(
    exported.nodes.some(
      (node: { id: string }) => node.id === "fictional:CAM-01",
    ),
  ).toBe(false);
  expect(
    exported.nodes.filter(
      (node: { type: string }) => node.type === "PoliceRecord",
    ),
  ).toHaveLength(5);
});
