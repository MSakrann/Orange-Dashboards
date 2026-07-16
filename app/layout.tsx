import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Orange Dashboards",
    template: "%s | Orange Dashboards",
  },
  description: "Focused delivery dashboards for Orange workspaces.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <title>Orange Dashboards</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
