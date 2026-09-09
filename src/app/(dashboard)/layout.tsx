import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { JarvisDrawer } from "@/components/jarvis/jarvis-drawer";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <Topbar />
        {/* Extra bottom clearance so page content (e.g. the AI Owner Advisor
            panel's last suggested-question chip) doesn't sit under the
            fixed Jarvis FAB, which floats at bottom-5 right-5 on every
            breakpoint. */}
        <main className="flex-1 overflow-x-hidden px-4 pt-6 pb-24 lg:px-8 lg:pt-8 lg:pb-24">{children}</main>
      </div>
      <JarvisDrawer />
    </div>
  );
}
