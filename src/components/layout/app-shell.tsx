"use client";

import { ContentPane, type ContentWidth } from "@/components/board/step-chrome";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  ContentRouteLoading,
  useNavigationPending,
} from "@/components/layout/navigation-pending";
import { SiteHeader } from "@/components/layout/site-header";

interface AppShellProps {
  children: React.ReactNode;
  contentWidth?: ContentWidth;
}

export function AppShell({ children, contentWidth = "uniform" }: AppShellProps) {
  const { isPending } = useNavigationPending();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <SiteHeader variant="app" />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
          <ContentPane width={contentWidth} className="flex min-h-0 flex-1 flex-col">
            {isPending ? <ContentRouteLoading /> : children}
          </ContentPane>
        </main>
      </div>
    </div>
  );
}
