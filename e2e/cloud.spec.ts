import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

const slug = process.env.E2E_WORKSPACE_SLUG!;
const adminEmail = process.env.E2E_ADMIN_EMAIL!;
const adminPassword = process.env.E2E_ADMIN_PASSWORD!;

function uniqueName(prefix: string, testInfo: TestInfo) {
  return `${prefix} ${testInfo.workerIndex}-${testInfo.retry}-${randomUUID().slice(0, 8)}`;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

async function fillCredential(locator: Locator, value: string) {
  await locator.evaluate((element, credential) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Unable to populate credential field.");
    setter.call(input, credential);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function signIn(page: Page) {
  await page.goto(`/login?next=${encodeURIComponent(`/${slug}`)}`);
  await fillCredential(page.getByLabel("Email"), adminEmail);
  await fillCredential(page.getByLabel("Password"), adminPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/?$`));
  await expect(page.getByRole("button", { name: "New Project" })).toBeVisible();
  await expect(page.locator(".live-indicator")).toHaveText("Live", { timeout: 20_000 });
}

async function createProject(page: Page, title: string) {
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page.getByRole("dialog", { name: "New project" })).toBeVisible();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Cloud E2E disposable project");
  await page.getByLabel("Progress").fill("25");
  await page.getByLabel("Assignee").fill("E2E Admin");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

async function cleanupProjects(page: Page, titles: string[]) {
  await page.goto(`/${slug}`);
  for (const title of [...new Set(titles)]) {
    const deleteButton = page
      .getByRole("button", { name: `Delete ${title}`, exact: true })
      .first();
    if (await deleteButton.count() === 0) continue;
    page.once("dialog", (dialog) => dialog.accept());
    await deleteButton.click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  }
}

async function cleanupStatuses(page: Page, names: string[]) {
  await page.goto(`/${slug}/settings/statuses`);
  for (const name of [...new Set(names)]) {
    const deleteButton = page.getByRole("button", { name: `Delete ${name}`, exact: true });
    if (await deleteButton.count() === 0) continue;
    await deleteButton.click();
    await page.getByLabel("Replacement status").selectOption({ index: 1 });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  }
}

test.describe("cloud Supabase administration", () => {
  test("admin can sign in and sees admin-only navigation", async ({ page }) => {
    await page.goto("/login");
    await expectAccessible(page);
    await signIn(page);
    await expect(page.getByRole("link", { name: "History" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Status Settings" })).toBeVisible();
  });

  test("anonymous REST writes are denied by RLS", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const publicKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/work_items`, {
      method: "POST",
      headers: {
        apikey: publicKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: randomUUID(),
        workspace_id: randomUUID(),
        title: `Denied E2E write ${randomUUID()}`,
        status_id: randomUUID(),
        priority: "low",
        progress: 0,
        sort_order: 0,
      }),
    });
    const status = response.status;
    await response.body?.cancel();

    expect([401, 403]).toContain(status);
  });

  test("admin performs project, subtask, and comment CRUD", async ({ page }, testInfo) => {
    const project = uniqueName("E2E project", testInfo);
    const editedProject = `${project} edited`;
    const subtask = uniqueName("E2E subtask", testInfo);
    const editedSubtask = `${subtask} edited`;

    await signIn(page);
    try {
      await createProject(page, project);
      await page.getByRole("button", { name: `Edit ${project}` }).click();
      await page.getByLabel("Title").fill(editedProject);
      await page.getByLabel("Progress").fill("40");
      await page.getByRole("button", { name: "Save project" }).click();
      await expect(page.getByRole("heading", { name: editedProject, exact: true })).toBeVisible();

      await page.getByRole("button", { name: `View ${editedProject} details` }).click();
      await page.getByRole("button", { name: "Add subtask" }).click();
      await page.getByLabel("Title").fill(subtask);
      await page.getByLabel("Description").fill("Cloud E2E disposable subtask");
      await page.getByLabel("Progress").fill("10");
      await page.getByRole("button", { name: "Create subtask" }).click();
      await expect(page.getByText(subtask, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: `Edit ${subtask}` }).click();
      await page.getByLabel("Title").fill(editedSubtask);
      await page.getByLabel("Progress").fill("20");
      await page.getByRole("button", { name: "Save subtask" }).click();
      await expect(page.getByText(editedSubtask, { exact: true })).toBeVisible();

      const comments = page.getByRole("region", { name: "Project comments" });
      const commentText = uniqueName("Cloud E2E comment", testInfo);
      const editedComment = `${commentText} edited`;
      await comments.getByRole("button", { name: "Add comment" }).click();
      await comments.getByLabel("Author").fill("E2E Admin");
      await comments.getByLabel("Comment").fill(commentText);
      await comments.getByRole("button", { name: "Post comment" }).click();
      await expect(comments.getByText(commentText)).toBeVisible();

      await comments.getByRole("button", { name: "Edit comment by E2E Admin" }).click();
      await comments.getByLabel("Comment").fill(editedComment);
      await comments.getByRole("button", { name: "Save comment" }).click();
      await expect(comments.getByText(editedComment)).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await comments.getByRole("button", { name: "Delete comment by E2E Admin" }).click();
      await expect(comments.getByText(editedComment)).toHaveCount(0);

      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: `Delete ${editedSubtask}` }).click();
      await expect(page.getByText(editedSubtask, { exact: true })).toHaveCount(0);
    } finally {
      await cleanupProjects(page, [project, editedProject]);
    }
  });

  test("two admins converge while creating, updating, reordering, and deleting statuses", async (
    { browser, page },
    testInfo,
  ) => {
    const status = uniqueName("E2E status", testInfo);
    const editedStatus = `${status} edited`;
    const project = uniqueName("E2E status project", testInfo);
    let secondContext: BrowserContext | undefined;

    await signIn(page);
    try {
      secondContext = await browser.newContext();
      const secondPage = await secondContext.newPage();
      await signIn(secondPage);
      await page.getByRole("link", { name: "Status Settings" }).click();
      await secondPage.getByRole("link", { name: "Status Settings" }).click();
      await expect(page.getByRole("heading", { name: "Status settings" })).toBeVisible();
      await expectAccessible(page);

      await page.getByRole("button", { name: "New status" }).click();
      await page.getByLabel("Status name").fill(status);
      await page.getByLabel("Status color").fill("#246a91");
      await page.getByLabel("Reporting category").selectOption("active");
      await page.getByRole("button", { name: "Create status" }).click();
      await expect(page.getByText(status, { exact: true })).toBeVisible();
      await expect(secondPage.getByText(status, { exact: true })).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole("button", { name: `Edit ${status}` }).click();
      await page.getByLabel("Status name").fill(editedStatus);
      await page.getByRole("button", { name: "Save status" }).click();
      await expect(page.getByText(editedStatus, { exact: true })).toBeVisible();
      await expect(secondPage.getByText(editedStatus, { exact: true })).toBeVisible({
        timeout: 20_000,
      });

      const moveUp = page.getByRole("button", { name: `Move ${editedStatus} up` });
      if (await moveUp.isEnabled()) {
        const statusItems = secondPage.locator(".status-list > li");
        const count = await statusItems.count();
        await moveUp.click();
        await expect(statusItems.nth(count - 2)).toContainText(editedStatus, {
          timeout: 20_000,
        });
      }

      await page.goto(`/${slug}`);
      await page.getByRole("button", { name: "New Project" }).click();
      await page.getByLabel("Title").fill(project);
      await page.getByLabel("Status").selectOption({ label: editedStatus });
      await page.getByRole("button", { name: "Create project" }).click();
      await page.goto(`/${slug}/settings/statuses`);
      await page.getByRole("button", { name: `Delete ${editedStatus}` }).click();
      await page.getByLabel("Replacement status").selectOption({ index: 1 });
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Confirm delete" }).click();
      await expect(secondPage.getByText(editedStatus, { exact: true })).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      await secondContext?.close();
      await cleanupProjects(page, [project]);
      await cleanupStatuses(page, [status, editedStatus]);
    }
  });

  test("History records a unique mutation and remains admin-only", async (
    { browser, page },
    testInfo,
  ) => {
    const project = uniqueName("E2E history project", testInfo);
    let publicContext: BrowserContext | undefined;

    await signIn(page);
    try {
      await createProject(page, project);
      await page.getByRole("link", { name: "History" }).click();
      await expect(page.getByRole("heading", { name: "Activity history" })).toBeVisible();
      await page.getByLabel("Action").selectOption("insert");
      await page.getByLabel("Entity type").selectOption("work_item");
      await page.getByRole("button", { name: "Apply filters" }).click();

      const matchingEntry = page.locator(".history-entry").filter({ hasText: project });
      await expect(matchingEntry).toBeVisible();
      await expect(matchingEntry).toContainText("Insert Work Item");
      await expect(matchingEntry).toContainText(project);
      await expectAccessible(page);

      publicContext = await browser.newContext();
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`/${slug}`);
      await expect(publicPage.getByRole("link", { name: "History" })).toHaveCount(0);
      await publicPage.goto(`/${slug}/history`);
      await expect(publicPage).toHaveURL(/\/login\?next=/);
    } finally {
      await publicContext?.close();
      await cleanupProjects(page, [project]);
    }
  });

  test("two browser contexts observe realtime project updates", async (
    { browser, page },
    testInfo,
  ) => {
    const project = uniqueName("E2E realtime project", testInfo);
    let publicContext: BrowserContext | undefined;

    await signIn(page);
    try {
      publicContext = await browser.newContext();
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`/${slug}`);
      await expect(publicPage.getByRole("status")).toHaveText("Live", { timeout: 20_000 });

      await createProject(page, project);
      await expect(publicPage.getByRole("heading", { name: project, exact: true })).toBeVisible({
        timeout: 20_000,
      });
      const editedProject = `${project} updated`;
      await page.getByRole("button", { name: `Edit ${project}` }).click();
      await page.getByLabel("Title").fill(editedProject);
      await page.getByRole("button", { name: "Save project" }).click();
      await expect(publicPage.getByRole("heading", { name: editedProject, exact: true }))
        .toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: `View ${editedProject} details` }).click();
      await publicPage.getByRole("button", { name: `View ${editedProject} details` }).click();
      const subtask = uniqueName("E2E realtime subtask", testInfo);
      await page.getByRole("button", { name: "Add subtask" }).click();
      await page.getByLabel("Title").fill(subtask);
      await page.getByRole("button", { name: "Create subtask" }).click();
      await expect(publicPage.getByText(subtask, { exact: true })).toBeVisible({
        timeout: 20_000,
      });

      const comment = uniqueName("E2E realtime comment", testInfo);
      const adminComments = page.getByRole("region", { name: "Project comments" });
      await adminComments.getByRole("button", { name: "Add comment" }).click();
      await adminComments.getByLabel("Author").fill("E2E Admin");
      await adminComments.getByLabel("Comment").fill(comment);
      await adminComments.getByRole("button", { name: "Post comment" }).click();
      await expect(
        publicPage.getByRole("region", { name: "Project comments" }).getByText(comment),
      ).toBeVisible({ timeout: 20_000 });

      await cleanupProjects(page, [project, editedProject]);
      await expect(
        publicPage.getByRole("heading", { name: editedProject, exact: true }),
      ).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      await publicContext?.close();
      await cleanupProjects(page, [project, `${project} updated`]);
    }
  });

  test("two admins reject a stale project edit without replaying intent", async (
    { browser, page },
    testInfo,
  ) => {
    const project = uniqueName("E2E stale project", testInfo);
    const authoritativeTitle = `${project} authoritative`;
    let secondContext: BrowserContext | undefined;

    await signIn(page);
    try {
      await createProject(page, project);
      secondContext = await browser.newContext();
      const secondPage = await secondContext.newPage();
      await signIn(secondPage);
      await expect(secondPage.getByRole("heading", { name: project, exact: true })).toBeVisible();

      await page.getByRole("button", { name: `Edit ${project}` }).click();
      await secondPage.getByRole("button", { name: `Edit ${project}` }).click();
      await page.getByLabel("Title").fill(authoritativeTitle);
      await page.getByRole("button", { name: "Save project" }).click();
      await expect(page.getByRole("heading", { name: authoritativeTitle, exact: true })).toBeVisible();

      await secondPage.getByLabel("Title").fill(`${project} stale`);
      await secondPage.getByRole("button", { name: "Save project" }).click();
      await expect(secondPage.getByRole("alert")).toContainText(
        "changed by another administrator",
      );
      await expect(secondPage.getByLabel("Title")).toHaveCount(0);
      await expect(secondPage.getByRole("button", { name: "Retry" })).toHaveCount(0);
      await expect(
        secondPage.getByRole("heading", { name: authoritativeTitle, exact: true }),
      ).toBeVisible();
    } finally {
      await secondContext?.close();
      await cleanupProjects(page, [project, authoritativeTitle, `${project} stale`]);
    }
  });
});
