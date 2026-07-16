import type { Metadata } from "next";
import { safeReturnTo } from "@/lib/auth/return-to";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin sign in" };

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.next);
  const initialError = params.error ? "The sign-in link could not be verified." : undefined;

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <span className="brand-mark" aria-hidden="true">
          O
        </span>
        <p className="eyebrow">Dashboard administration</p>
        <h1 id="login-title">Sign in</h1>
        <p className="login-intro">
          Use your administrator email and password. New accounts cannot be created here.
        </p>
        <LoginForm returnTo={returnTo} initialError={initialError} />
      </section>
    </main>
  );
}
