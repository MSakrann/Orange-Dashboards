import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const externalBaseUrl = process.env.E2E_BASE_URL?.replace(/\/$/, "");
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const isPublicFixture = process.env.E2E_SUITE !== "cloud";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: isPublicFixture
    ? process.env.CI
      ? [["line"], ["html", { open: "never" }]]
      : [["list"], ["html", { open: "never" }]]
    : [["line"]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: isPublicFixture ? "retain-on-failure" : "off",
    screenshot: isPublicFixture ? "only-on-failure" : "off",
    video: isPublicFixture ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command:
          `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          ...(isPublicFixture
            ? {
                NEXT_PUBLIC_SUPABASE_URL: "",
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
                NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
              }
            : {}),
        },
      },
});
