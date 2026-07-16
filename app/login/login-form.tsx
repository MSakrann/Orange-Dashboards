"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface LoginFormProps {
  returnTo: string;
  initialError?: string;
}

export function LoginForm({ returnTo, initialError }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("Sign-in failed. Check your email and password.");
        return;
      }

      router.replace(returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} aria-busy={isLoading}>
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          type="email"
          required
          disabled={isLoading}
        />
      </div>
      <div className="form-field">
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          id="password"
          name="password"
          type="password"
          required
          disabled={isLoading}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button" type="submit" disabled={isLoading}>
        {isLoading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
