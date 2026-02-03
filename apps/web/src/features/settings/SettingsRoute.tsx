import React, { useEffect } from "react";

import type { SettingsTabId } from "../../app/routes";
import type { UpdateStatus } from "../../app/types";
import { SettingsPage } from "./SettingsPage";

export function SettingsRoute({
  canUseApi,
  activeSettingsTab,
  updateStatus,
  checkForUpdates,
  settingsPageProps
}: {
  canUseApi: boolean;
  activeSettingsTab: SettingsTabId;
  updateStatus: UpdateStatus | null;
  checkForUpdates: (force?: boolean) => Promise<void> | void;
  settingsPageProps: React.ComponentProps<typeof SettingsPage>;
}) {
  useEffect(() => {
    if (!canUseApi) return;
    if (activeSettingsTab !== "updates") return;
    if (updateStatus) return;
    void checkForUpdates(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseApi, activeSettingsTab, updateStatus]);

  return <SettingsPage {...settingsPageProps} />;
}

