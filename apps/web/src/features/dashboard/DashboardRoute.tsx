import React, { useEffect } from "react";

import { DASHBOARD_STATS_INTERVAL_MS } from "../../constants/ui";
import { DashboardPage } from "./DashboardPage";

export function DashboardRoute({
  canUseApi,
  loadAll,
  loadDashboardStats,
  loadStreamingStatsHistory,
  dashboardPageProps
}: {
  canUseApi: boolean;
  loadAll: () => Promise<void> | void;
  loadDashboardStats: () => Promise<void> | void;
  loadStreamingStatsHistory: () => Promise<void> | void;
  dashboardPageProps: React.ComponentProps<typeof DashboardPage>;
}) {
  useEffect(() => {
    if (!canUseApi) return;
    void loadAll();
    void loadDashboardStats();
    // Intentionally omit callbacks from deps to avoid re-polling on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseApi]);

  useEffect(() => {
    if (!canUseApi) return;
    void loadStreamingStatsHistory();
    const interval = window.setInterval(() => {
      void loadStreamingStatsHistory();
    }, DASHBOARD_STATS_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseApi]);

  return <DashboardPage {...dashboardPageProps} />;
}

