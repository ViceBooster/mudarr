import React from "react";

import type { AudioDbArtist, ArtistPreference } from "../../app/types";

type ImportArtistModalProps = {
  artist: AudioDbArtist | null;
  onClose: () => void;
  importMode: ArtistPreference["import_mode"];
  setImportMode: React.Dispatch<React.SetStateAction<ArtistPreference["import_mode"]>>;
  importQuality: ArtistPreference["quality"];
  setImportQuality: React.Dispatch<React.SetStateAction<ArtistPreference["quality"]>>;
  importAutoDownload: boolean;
  setImportAutoDownload: React.Dispatch<React.SetStateAction<boolean>>;
  isImportingArtist: boolean;
  onImport: (artistId: AudioDbArtist["id"], artistName?: string) => void | Promise<unknown>;
};

export function ImportArtistModal({
  artist,
  onClose,
  importMode,
  setImportMode,
  importQuality,
  setImportQuality,
  importAutoDownload,
  setImportAutoDownload,
  isImportingArtist,
  onImport
}: ImportArtistModalProps) {
  if (!artist) return null;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="text-lg font-semibold text-slate-900">Add {artist.name}</div>
        <p className="mt-1 text-sm text-slate-500">
          Choose how you want to import this artist and which quality to target for downloads.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Import mode
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "discography"}
                  onChange={() => setImportMode("discography")}
                />
                <span>
                  <span className="font-semibold">Discography</span> — import all albums and tracks,
                  and optionally queue downloads.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "new"}
                  onChange={() => setImportMode("new")}
                />
                <span>
                  <span className="font-semibold">New albums only</span> — import albums but mark them
                  unmonitored for now.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === "custom"}
                  onChange={() => setImportMode("custom")}
                />
                <span>
                  <span className="font-semibold">Custom</span> — import metadata only and manually
                  queue downloads per song/album.
                </span>
              </label>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quality</div>
            <select
              value={importQuality}
              onChange={(event) => setImportQuality(event.currentTarget.value as ArtistPreference["quality"])}
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value={"144p"}>144p</option>
              <option value={"240p"}>240p</option>
              <option value={"360p"}>360p</option>
              <option value={"480p"}>480p</option>
              <option value={"720p"}>720p</option>
              <option value={"1080p"}>1080p</option>
              <option value={"1440p"}>1440p</option>
              <option value={"2160p"}>4K (2160p)</option>
              <option value={"4320p"}>8K (4320p)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={importAutoDownload}
              onChange={(event) => setImportAutoDownload(event.currentTarget.checked)}
            />
            Auto-download tracks after import
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void onImport(artist.id, artist.name)}
            disabled={isImportingArtist}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isImportingArtist && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
            )}
            {isImportingArtist ? "Adding..." : "Add artist"}
          </button>
        </div>
      </div>
    </div>
  );
}

