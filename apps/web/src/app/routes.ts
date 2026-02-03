export const tabs = [
  "Dashboard",
  "Artists",
  "Downloads",
  "Lists",
  "Streams",
  "Logs",
  "Settings"
] as const;

export type TabId = (typeof tabs)[number];

export const settingsTabs = [
  { id: "general", label: "General" },
  { id: "api-keys", label: "API keys" },
  { id: "streaming-options", label: "Streaming" },
  { id: "downloads", label: "Downloads" },
  { id: "search", label: "Search" },
  { id: "youtube", label: "YouTube" },
  { id: "updates", label: "Updates" },
  { id: "plex", label: "Plex" }
] as const;

export type SettingsTabId = (typeof settingsTabs)[number]["id"];
export const defaultSettingsTab: SettingsTabId = settingsTabs[0].id;

export const tabRoutes: Record<TabId, string> = {
  Dashboard: "/dashboard",
  Artists: "/artists",
  Downloads: "/downloads",
  Lists: "/lists",
  Streams: "/streams",
  Logs: "/logs",
  Settings: "/settings"
};

export const streamCreateRoute = "/streams/create";

