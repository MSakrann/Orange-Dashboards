import { notFound } from "next/navigation";
import { AdminUiPreview } from "./preview-client";

export const dynamic = "force-dynamic";

export default function AdminUiPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminUiPreview />;
}
