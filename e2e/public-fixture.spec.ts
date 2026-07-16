import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("public fixture workspace", () => {
  test("navigates workspaces with read-only UI; PGlite covers write policy", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/hot-topics$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Hot Topics Daily Follow-up",
    );
    await expect(page.getByRole("status")).toContainText("Local/test fixture");

    await expect(page.getByRole("button", { name: "New Project" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "History" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Status Settings" })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Workspace" }).selectOption("pe-development");
    await expect(page).toHaveURL(/\/pe-development$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("PE Development");

    await page.getByRole("combobox", { name: "Workspace" }).selectOption("platform-development");
    await expect(page).toHaveURL(/\/platform-development$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Platform Development",
    );
    await expectAccessible(page);
  });

  test("uses a light responsive layout without emoji controls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/hot-topics");

    const backgroundLuminance = await page.locator("body").evaluate((element) => {
      const channels = getComputedStyle(element).backgroundColor
        .match(/\d+(?:\.\d+)?/g)
        ?.slice(0, 3)
        .map(Number);
      if (!channels || channels.length !== 3) return 0;
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    });
    expect(backgroundLuminance).toBeGreaterThan(0.75);
    const overflow = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .map((element) => ({
          element: `${element.tagName.toLowerCase()}.${element.className}`,
          right: Math.round(element.getBoundingClientRect().right),
        })));
    expect(overflow).toEqual([]);

    const card = page.locator(".project-card").first();
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(350);

    await page.getByRole("button", { name: /View .* details/ }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close project details" })).toHaveText("x");

    const controlText = await page.getByRole("button").allTextContents();
    expect(controlText.join("")).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test("project dialog is labelled, traps focus, closes, and restores focus", async ({ page }) => {
    await page.goto("/hot-topics");
    const opener = page.getByRole("button", { name: /View .* details/ }).first();
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAccessibleName(/Daily Priority Follow-ups/);
    await expect(page.locator("main.dashboard")).toHaveAttribute("inert", "");
    await expect(dialog.getByRole("button", { name: "Close project details" })).toBeFocused();
    await expectAccessible(page);

    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("login is accessible and public admin routes remain protected", async ({ page }) => {
    await page.goto("/login?next=%2Fhot-topics%2Fhistory");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
    await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
    await expectAccessible(page);

    await page.goto("/hot-topics/settings/statuses");
    await expect(page).toHaveURL(/\/hot-topics$/);
    await page.goto("/hot-topics/history");
    await expect(page).toHaveURL(/\/hot-topics$/);
  });
});
