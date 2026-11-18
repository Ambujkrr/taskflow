import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function checkAccessibility(page: import("@playwright/test").Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
}

test("registration, persistence, CRUD, filters, dashboard, and logout", async ({
  page,
}) => {
  const email = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await checkAccessibility(page);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Smoke Tester");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Smoke-test-password-678!");
  await page.getByRole("button", { name: "Create your workspace" }).click();
  await expect(
    page.getByRole("heading", { name: /Let’s find your flow/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "New task", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title").fill("Smoke test task");
  await page.getByLabel(/Description/).fill("A real end-to-end check");
  await page.getByLabel("Priority", { exact: true }).selectOption("HIGH");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Smoke test task A real end-to-end check",
    }),
  ).toBeVisible();
  await checkAccessibility(page);
  await page.screenshot({
    path: `.local/taskflow-${test.info().project.name}.jpg`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Smoke test task A real end-to-end check" })
    .click();
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByLabel("Task title").fill("Verified task");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Verified task A real end-to-end check" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete Verified task", exact: true })
    .click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await page
    .getByRole("textbox", { name: "Search tasks" })
    .fill("does-not-exist");
  await expect(
    page.getByRole("heading", { name: "No tasks match just yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("button", { name: "Verified task A real end-to-end check" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Filter by status", exact: true })
    .selectOption("COMPLETED");
  await page
    .getByRole("combobox", { name: "Filter by priority", exact: true })
    .selectOption("HIGH");
  await expect(
    page.getByRole("button", { name: "Verified task A real end-to-end check" }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Actions for Verified task" })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Actions for Verified task" })
      .click();
  const deletion = page.getByRole("button", {
    name: "Delete Verified task",
    exact: true,
  });
  if (await deletion.isVisible()) await deletion.click();
  else
    await page
      .getByRole("button", { name: "Delete task", exact: true })
      .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete task", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No tasks match just yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Good things start with a task." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Smoke-test-password-678!");
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(
    page.getByRole("button", { name: "New task", exact: true }),
  ).toBeVisible();
});
