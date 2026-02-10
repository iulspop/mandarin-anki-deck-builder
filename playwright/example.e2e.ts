import { expect, test } from "@playwright/test";

test("given: app is running, should: load homepage", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/./);
});
