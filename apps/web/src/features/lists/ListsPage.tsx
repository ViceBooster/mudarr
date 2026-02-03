import React from "react";

export type ImportMode = "discography" | "new" | "custom";
export type Quality =
  | "144p"
  | "240p"
  | "360p"
  | "480p"
  | "720p"
  | "1080p"
  | "1440p"
  | "2160p"
  | "4320p";

type ListSource = {
  id: number;
  type: string;
  external_id: string;
  name: string;
};

type GenreImportJob = {
  genre_name: string;
  status: string;
  processed: number;
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  updated_at?: string | null;
  error_samples: Array<{ name: string; message: string }> | null;
};

type ConfiguredGenreImport = {
  id: number;
  name: string;
  created_at: string;
  import_source?: "lastfm" | null;
  import_limit?: number | null;
  import_mode?: ImportMode | null;
  import_quality?: Quality | null;
  import_auto_download?: boolean | null;
  import_enabled?: boolean | null;
  imported_at?: string | null;
};

type RunGenreImportOptions = {
  name: string;
  source: "lastfm";
  limit: number;
  importMode: ImportMode;
  quality: Quality;
  autoDownload: boolean;
  enabled: boolean;
};

type ListsPageProps = {
  newListType: string;
  setNewListType: React.Dispatch<React.SetStateAction<string>>;
  newListId: string;
  setNewListId: React.Dispatch<React.SetStateAction<string>>;
  newListName: string;
  setNewListName: React.Dispatch<React.SetStateAction<string>>;
  addList: () => void;
  filteredLists: ListSource[];

  genreImportNotice: string | null;
  genreImportSource: "lastfm";
  setGenreImportSource: React.Dispatch<React.SetStateAction<"lastfm">>;
  genreImportName: string;
  selectGenreImportTag: (tag: string) => void;
  lastfmTagsStatus: "idle" | "loading" | "error";
  lastfmTagOptions: string[];
  genreImportLimit: number;
  setGenreImportLimit: React.Dispatch<React.SetStateAction<number>>;
  importGenreArtists: () => void;
  isGenreImporting: boolean;
  isGenreImportRunning: boolean;
  saveGenreImportSettings: () => void;
  resetGenreImportForm: () => void;

  genreImportMode: ImportMode;
  setGenreImportMode: React.Dispatch<React.SetStateAction<ImportMode>>;
  genreImportQuality: Quality;
  setGenreImportQuality: React.Dispatch<React.SetStateAction<Quality>>;
  genreImportAutoDownload: boolean;
  setGenreImportAutoDownload: React.Dispatch<React.SetStateAction<boolean>>;
  genreImportEnabled: boolean;
  setGenreImportEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  lastfmTagsError: string | null;

  genreImportJob: GenreImportJob | null;
  genreImportProgress: number;

  configuredGenreImports: ConfiguredGenreImport[];
  editGenreImport: (genre: ConfiguredGenreImport) => void;
  runGenreImport: (options: RunGenreImportOptions) => void | Promise<unknown>;
  deleteGenreImportSettings: (genreId: number, genreName: string) => void;
};

export const ListsPage = ({
  newListType,
  setNewListType,
  newListId,
  setNewListId,
  newListName,
  setNewListName,
  addList,
  filteredLists,
  genreImportNotice,
  genreImportSource,
  setGenreImportSource,
  genreImportName,
  selectGenreImportTag,
  lastfmTagsStatus,
  lastfmTagOptions,
  genreImportLimit,
  setGenreImportLimit,
  importGenreArtists,
  isGenreImporting,
  isGenreImportRunning,
  saveGenreImportSettings,
  resetGenreImportForm,
  genreImportMode,
  setGenreImportMode,
  genreImportQuality,
  setGenreImportQuality,
  genreImportAutoDownload,
  setGenreImportAutoDownload,
  genreImportEnabled,
  setGenreImportEnabled,
  lastfmTagsError,
  genreImportJob,
  genreImportProgress,
  configuredGenreImports,
  editGenreImport,
  runGenreImport,
  deleteGenreImportSettings
}: ListsPageProps) => (
  <section className="space-y-4">
    <h2 className="text-lg font-semibold">List sources</h2>
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <select
        value={newListType}
        onChange={(event) => setNewListType(event.currentTarget.value)}
        className="w-full md:w-40 rounded-lg border border-slate-200 px-3 py-2 text-sm"
      >
        <option value="spotify">Spotify</option>
        <option value="lastfm">Last.fm</option>
      </select>
      <input
        value={newListId}
        onChange={(event) => setNewListId(event.currentTarget.value)}
        placeholder="List ID"
        className="w-full md:w-52 rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <input
        value={newListName}
        onChange={(event) => setNewListName(event.currentTarget.value)}
        placeholder="List name"
        className="w-full md:w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <button
        onClick={addList}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Add
      </button>
    </div>
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <ul className="space-y-2 text-sm">
        {filteredLists.map((list) => (
          <li
            key={list.id}
            className="flex flex-col gap-1 rounded-lg border border-slate-100 p-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="font-semibold text-slate-900">{list.name}</div>
            <div className="text-xs text-slate-500">
              {list.type} · {list.external_id}
            </div>
          </li>
        ))}
        {filteredLists.length === 0 && <li className="text-sm text-slate-500">No lists yet.</li>}
      </ul>
    </div>

    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">Genre imports</div>
        {genreImportNotice && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs text-indigo-700">
            {genreImportNotice}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Pull the top artists for a genre and import them into Mudarr.
      </p>
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
        <select
          value={genreImportSource}
          onChange={(event) => setGenreImportSource(event.currentTarget.value as "lastfm")}
          className="w-full md:w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="lastfm">Last.fm</option>
        </select>
        <select
          value={genreImportName}
          onChange={(event) => selectGenreImportTag(event.currentTarget.value)}
          disabled={lastfmTagsStatus === "loading" || lastfmTagOptions.length === 0}
          className="w-full md:w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          <option value="">
            {lastfmTagsStatus === "loading" ? "Loading genres..." : "Select a Last.fm genre"}
          </option>
          {lastfmTagOptions.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <select
          value={genreImportLimit}
          onChange={(event) => setGenreImportLimit(Number(event.currentTarget.value))}
          className="w-full md:w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value={20}>Top 20</option>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
          <option value={200}>Top 200</option>
        </select>
        <button
          onClick={importGenreArtists}
          disabled={!genreImportName.trim() || isGenreImporting || isGenreImportRunning}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenreImporting || isGenreImportRunning ? "Importing..." : "Run import"}
        </button>
        <button
          onClick={saveGenreImportSettings}
          disabled={!genreImportName.trim() || isGenreImporting}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save settings
        </button>
        <button
          onClick={resetGenreImportForm}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Import mode
          </div>
          <select
            value={genreImportMode}
            onChange={(event) => setGenreImportMode(event.currentTarget.value as ImportMode)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="discography">Discography</option>
            <option value="new">New albums only</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Quality
          </div>
          <select
            value={genreImportQuality}
            onChange={(event) => setGenreImportQuality(event.currentTarget.value as Quality)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="144p">144p</option>
            <option value="240p">240p</option>
            <option value="360p">360p</option>
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="1440p">1440p</option>
            <option value="2160p">4K (2160p)</option>
            <option value="4320p">8K (4320p)</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={genreImportAutoDownload}
              onChange={(event) => setGenreImportAutoDownload(event.currentTarget.checked)}
            />
            Auto download
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={genreImportEnabled}
              onChange={(event) => setGenreImportEnabled(event.currentTarget.checked)}
            />
            Enabled
          </label>
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        {lastfmTagsStatus === "error" && lastfmTagsError
          ? `Unable to load Last.fm genres: ${lastfmTagsError}`
          : "Requires a Last.fm API key (Settings or `LASTFM_API_KEY`)."}
      </div>
      {genreImportJob && (
        <div className="mt-4 rounded-lg border border-slate-100 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-slate-900">Importing {genreImportJob.genre_name}</div>
            <div className="text-xs text-slate-500">{genreImportJob.status}</div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${genreImportProgress}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {genreImportJob.processed}/{genreImportJob.total} processed · Imported {genreImportJob.imported} · Skipped{" "}
            {genreImportJob.skipped} · Errors {genreImportJob.errors}
          </div>
          {genreImportJob.updated_at && (
            <div className="mt-1 text-[10px] text-slate-400">
              Last update: {new Date(genreImportJob.updated_at).toLocaleTimeString()}
            </div>
          )}
          {genreImportJob.error_samples && genreImportJob.error_samples.length > 0 && (
            <div className="mt-3 rounded-md border border-rose-100 bg-rose-50 p-2 text-xs text-rose-700">
              <div className="font-semibold text-rose-800">Recent errors</div>
              <ul className="mt-2 space-y-1">
                {genreImportJob.error_samples.map((error) => (
                  <li key={`${error.name}-${error.message}`}>
                    <span className="font-semibold">{error.name}:</span> {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Configured genres
        </div>
        <ul className="mt-3 space-y-2">
          {configuredGenreImports.map((genre) => (
            <li
              key={genre.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-white p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-semibold text-slate-900">{genre.name}</div>
                <div className="text-xs text-slate-500">
                  Source: {genre.import_source ?? "lastfm"} · Limit: {genre.import_limit ?? "-"} · Mode:{" "}
                  {genre.import_mode ?? "new"} · Quality: {genre.import_quality ?? "1080p"} · Auto download:{" "}
                  {genre.import_auto_download ? "on" : "off"} · {genre.import_enabled ? "Enabled" : "Disabled"}
                </div>
                {genre.imported_at && (
                  <div className="text-xs text-slate-400">
                    Last import: {new Date(genre.imported_at).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => editGenreImport(genre)}
                  className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  onClick={() =>
                    runGenreImport({
                      name: genre.name,
                      source: (genre.import_source as "lastfm") ?? "lastfm",
                      limit: genre.import_limit ?? 50,
                      importMode: genre.import_mode ?? "new",
                      quality: genre.import_quality ?? "1080p",
                      autoDownload: genre.import_auto_download ?? false,
                      enabled: genre.import_enabled ?? true
                    })
                  }
                  disabled={isGenreImportRunning}
                  className="rounded-md border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isGenreImportRunning ? "Running..." : "Run"}
                </button>
                <button
                  onClick={() => deleteGenreImportSettings(genre.id, genre.name)}
                  className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Remove import
                </button>
              </div>
            </li>
          ))}
          {configuredGenreImports.length === 0 && (
            <li className="text-sm text-slate-500">No genre imports yet.</li>
          )}
        </ul>
      </div>
    </div>
  </section>
);

