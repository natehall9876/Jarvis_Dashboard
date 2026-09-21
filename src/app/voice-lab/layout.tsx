import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { LabShell } from "./lab-shell";

export const dynamic = "force-dynamic";

export default function VoiceLabLayout({ children }: { children: ReactNode }) {
  // Development harness only — never exists in a production build.
  if (process.env.NODE_ENV === "production") notFound();
  return <LabShell>{children}</LabShell>;
}
