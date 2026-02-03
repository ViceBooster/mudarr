import React from "react";

import type { SettingsTabId, TabId } from "../routes";

type SettingsTab = {
  id: SettingsTabId;
  label: string;
};

type ArtistImportJob = {
  id: number;
  artist_name: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress_stage: string | null;
  error_message: string | null;
};

type SidebarProps = {
  visibleTabs: readonly TabId[];
  activeTab: TabId;
  isStreamCreateRoute: boolean;
  activeSettingsTab: SettingsTabId;
  settingsTabs: readonly SettingsTab[];
  artistImportJobs: readonly ArtistImportJob[];
  tabLabel: (tab: TabId) => React.ReactNode;
  tabIcon: (tab: TabId) => React.ReactNode;
  onChangeTab: (tab: TabId) => void;
  onChangeSettingsTab: (tabId: SettingsTabId) => void;
  onOpenStreamCreate: () => void;
};

export const Sidebar = ({
  visibleTabs,
  activeTab,
  isStreamCreateRoute,
  activeSettingsTab,
  settingsTabs,
  artistImportJobs,
  tabLabel,
  tabIcon,
  onChangeTab,
  onChangeSettingsTab,
  onOpenStreamCreate
}: SidebarProps) => (
  <aside className="bg-slate-900 text-slate-100 md:w-64 w-full p-6 flex flex-col md:sticky md:top-0 md:h-screen md:self-start md:overflow-y-auto">
    <div className="flex justify-center -mx-6">
      <img
        src="/mudarr_cropped.png"
        alt="Mudarr"
        className="w-full max-w-[220px] h-auto object-contain"
      />
    </div>
    <nav className="mt-6 space-y-1 flex-1">
      {visibleTabs.map((tab) => {
        if (tab === "Streams") {
          return (
            <div key={tab} className="space-y-1">
              <button
                onClick={() => onChangeTab(tab)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  activeTab === tab && !isStreamCreateRoute
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  {tabIcon(tab)}
                  <span>Streams</span>
                </span>
              </button>
              {activeTab === "Streams" && (
                <button
                  onClick={onOpenStreamCreate}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                    isStreamCreateRoute
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                  }`}
                >
                  Create stream
                </button>
              )}
            </div>
          );
        }

        if (tab === "Settings") {
          return (
            <div key={tab} className="space-y-1">
              <button
                onClick={() => onChangeSettingsTab(activeSettingsTab)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                  activeTab === tab
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  {tabIcon(tab)}
                  <span>Settings</span>
                </span>
              </button>
              {activeTab === "Settings" &&
                settingsTabs.map((settingsTab) => (
                  <button
                    key={settingsTab.id}
                    onClick={() => onChangeSettingsTab(settingsTab.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      activeSettingsTab === settingsTab.id
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-white"
                    }`}
                  >
                    {settingsTab.label}
                  </button>
                ))}
            </div>
          );
        }

        return (
          <button
            key={tab}
            onClick={() => onChangeTab(tab)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeTab === tab
                ? "bg-slate-800 text-white"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-2">
              {tabIcon(tab)}
              <span className="flex-1">{tabLabel(tab)}</span>
            </span>
          </button>
        );
      })}
    </nav>

    {/* Artist Import Progress */}
    {artistImportJobs.length > 0 && (
      <div className="mt-auto border-t border-slate-700 pt-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Importing Artists
        </div>
        <div className="space-y-2">
          {artistImportJobs.map((job) => (
            <div key={job.id} className="bg-slate-800 rounded-lg p-3 text-xs">
              <div className="font-medium text-white mb-1">{job.artist_name}</div>
              <div className="text-slate-400 text-[10px]">
                {job.status === "pending" && "Queued..."}
                {job.status === "processing" && (job.progress_stage || "Processing...")}
                {job.status === "failed" && `Failed: ${job.error_message}`}
              </div>
              {job.status === "processing" && (
                <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full animate-pulse w-full" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </aside>
);

