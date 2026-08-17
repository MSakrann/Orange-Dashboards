import type { ReactNode } from "react";
import { Manrope, Outfit } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--dept-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--dept-body",
  display: "swap",
});

export default function DeptStructureLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`dept-root ${outfit.variable} ${manrope.variable}`}>
      {children}
    </div>
  );
}
