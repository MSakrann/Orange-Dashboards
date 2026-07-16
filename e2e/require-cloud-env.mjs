const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_WORKSPACE_SLUG",
];

const missing = required.filter((name) => !process.env[name]?.trim());
const missingPublicKey =
  !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (missing.length || missingPublicKey) {
  const keyMessage = missingPublicKey
    ? `${missing.length ? ", " : ""}NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)`
    : "";
  console.error(
    `Cloud E2E requires these environment variables: ${missing.join(", ")}${keyMessage}. ` +
      "Use a dedicated test Supabase project or disposable test data; the suite performs CRUD.",
  );
  process.exit(1);
}

console.log("Cloud E2E environment is configured.");
