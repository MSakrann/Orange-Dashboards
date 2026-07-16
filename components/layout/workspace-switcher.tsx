"use client";

import { useRouter } from "next/navigation";
import { workspaces } from "@/data/workspaces";

interface WorkspaceSwitcherProps {
  activeSlug: string;
}

export function WorkspaceSwitcher({ activeSlug }: WorkspaceSwitcherProps) {
  const router = useRouter();

  return (
    <label className="workspace-switcher">
      <span>Workspace</span>
      <select
        aria-label="Workspace"
        value={activeSlug}
        onChange={(event) => router.push(`/${event.target.value}`)}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.slug} value={workspace.slug}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}
