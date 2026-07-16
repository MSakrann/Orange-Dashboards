"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SessionControlsProps {
  email: string;
  returnTo?: string;
}

export function SessionControls({ email, returnTo = "/hot-topics" }: SessionControlsProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function signOut() {
    setError("");
    setIsLoading(true);

    try {
      const { error: signOutError } = await createClient().auth.signOut();
      if (signOutError) {
        setError("Unable to sign out. Please try again.");
        return;
      }
      router.replace(`/login?next=${encodeURIComponent(returnTo)}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign out.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="session-controls">
      <span>
        Signed in as <strong>{email}</strong>
      </span>
      <button type="button" onClick={signOut} disabled={isLoading}>
        {isLoading ? "Signing out..." : "Sign out"}
      </button>
      {error ? (
        <span className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
