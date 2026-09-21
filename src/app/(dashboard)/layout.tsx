import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { JarvisProvider } from "@/components/jarvis/jarvis-provider";
import { VoiceDock } from "@/components/jarvis/voice-dock";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    // The sidebar is `fixed` (see Sidebar) and taken out of normal flow
    // entirely, so this stays a plain, normally-scrolling page — no nested
    // flex/overflow containers to fight. `lg:pl-60` reserves the strip the
    // fixed sidebar occupies so page content doesn't render underneath it.
    // (A real bug was found and fixed here: the original min-h-screen flex-
    // row layout let the sidebar scroll away with a long page once content
    // exceeded one viewport — confirmed in the browser before this fix.)
    // JarvisProvider sits at the layout level, which Next.js keeps mounted across
    // client-side navigation — that is what makes the conversation, microphone
    // and speech output persist while moving between pages.
    <JarvisProvider>
    <div className="min-h-screen w-full lg:pl-60">
      <Sidebar />
      <div className="flex min-h-screen flex-col">
        <MobileNav />
        <Topbar />
        {/* Extra bottom clearance so page content (e.g. the AI Owner Advisor
            panel's last suggested-question chip) doesn't sit under the
            fixed mobile tab bar + Jarvis FAB (mobile) or just the FAB
            (desktop, no tab bar there). */}
        <main className="flex-1 overflow-x-hidden px-4 pt-6 pb-36 lg:px-8 lg:pt-8 lg:pb-24">{children}</main>
      </div>
      <VoiceDock />
    </div>
    </JarvisProvider>
  );
}
