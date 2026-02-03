import React from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type YoutubeStatus = {
  cookiesPath?: string | null;
  cookiesFromBrowser?: string | null;
  cookiesHeader?: string | null;
  outputFormat?: string | null;
};

type YoutubeTabProps<TOutputFormat extends string> = {
  youtubeOutputFormat: TOutputFormat;
  setYoutubeOutputFormat: React.Dispatch<React.SetStateAction<TOutputFormat>>;

  youtubeCookiesPath: string;
  setYoutubeCookiesPath: React.Dispatch<React.SetStateAction<string>>;
  youtubeCookiesBrowser: string;
  setYoutubeCookiesBrowser: React.Dispatch<React.SetStateAction<string>>;
  youtubeCookiesHeader: string;
  setYoutubeCookiesHeader: React.Dispatch<React.SetStateAction<string>>;

  saveYoutubeSettings: () => void | Promise<unknown>;
  youtubeSaveStatus: SaveStatus;
  youtubeStatus: YoutubeStatus | null;
};

export function YoutubeTab<TOutputFormat extends string>({
  youtubeOutputFormat,
  setYoutubeOutputFormat,
  youtubeCookiesPath,
  setYoutubeCookiesPath,
  youtubeCookiesBrowser,
  setYoutubeCookiesBrowser,
  youtubeCookiesHeader,
  setYoutubeCookiesHeader,
  saveYoutubeSettings,
  youtubeSaveStatus,
  youtubeStatus
}: YoutubeTabProps<TOutputFormat>) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">YouTube (yt-dlp)</h3>
      <p className="mt-1 text-xs text-slate-500">
        Set cookies to avoid 403 errors. Use either a Netscape-format cookies file exported from
        your browser, or yt-dlp&apos;s cookies-from-browser option (e.g. chrome, firefox, or
        chrome:Default). You can also paste a raw Cookie header. You do not need a bearer token.
      </p>
      <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
          How to get cookies (macOS, Windows, Linux)
        </summary>
        <div className="mt-3 space-y-3">
          <div>
            <p className="font-semibold text-slate-700">macOS</p>
            <p>
              Option A: set &quot;Cookies from browser&quot; to{" "}
              <span className="font-mono">chrome</span> or{" "}
              <span className="font-mono">firefox</span>.
            </p>
            <p>
              Option B: export a Netscape cookies file and set its full path, e.g.{" "}
              <span className="font-mono">/Users/you/Downloads/cookies.txt</span>.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-700">Windows</p>
            <p>
              Option A: set &quot;Cookies from browser&quot; to{" "}
              <span className="font-mono">chrome</span> or{" "}
              <span className="font-mono">firefox</span>.
            </p>
            <p>
              Option B: export a Netscape cookies file and set its full path, e.g.{" "}
              <span className="font-mono">C:\\Users\\you\\Downloads\\cookies.txt</span>.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-700">Linux</p>
            <p>
              Option A: set &quot;Cookies from browser&quot; to{" "}
              <span className="font-mono">chrome</span> or{" "}
              <span className="font-mono">firefox</span>.
            </p>
            <p>
              Option B: export a Netscape cookies file and set its full path, e.g.{" "}
              <span className="font-mono">/home/you/Downloads/cookies.txt</span>.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-700">DevTools network tab (advanced)</p>
            <p>
              Open DevTools &gt; Network &gt; click a YouTube request &gt; Request Headers, then
              copy the <span className="font-mono">Cookie</span> header value and paste it into the
              &quot;Raw Cookie header&quot; field below.
            </p>
            <p>
              Response headers like <span className="font-mono">HTTP/2 200</span>,{" "}
              <span className="font-mono">content-type</span>, or{" "}
              <span className="font-mono">server</span> are not cookies. Look for the request{" "}
              <span className="font-mono">Cookie</span> header or export a Netscape cookies file
              instead.
            </p>
          </div>
          <p className="text-slate-500">
            Tip: if you use multiple browser profiles, try{" "}
            <span className="font-mono">chrome:Default</span> or{" "}
            <span className="font-mono">chrome:Profile 1</span>.
          </p>
        </div>
      </details>
      <div className="mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Output format for new downloads
        </div>
        <select
          value={youtubeOutputFormat}
          onChange={(event) => setYoutubeOutputFormat(event.currentTarget.value as TOutputFormat)}
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
        >
          <option value={"original" as TOutputFormat}>Keep original format (fastest)</option>
          <option value={"mp4-remux" as TOutputFormat}>MP4 (remux, no re-encode)</option>
          <option value={"mp4-recode" as TOutputFormat}>MP4 (re-encode, most compatible)</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Use MP4 if your browser cannot play WebM. Re-encode is slower but most compatible and
          requires ffmpeg.
        </p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input
          value={youtubeCookiesPath}
          onChange={(event) => setYoutubeCookiesPath(event.currentTarget.value)}
          placeholder="Cookies file path"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          value={youtubeCookiesBrowser}
          onChange={(event) => setYoutubeCookiesBrowser(event.currentTarget.value)}
          placeholder="Cookies from browser (e.g. chrome)"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      </div>
      <div className="mt-3">
        <textarea
          value={youtubeCookiesHeader}
          onChange={(event) => setYoutubeCookiesHeader(event.currentTarget.value)}
          placeholder="Raw Cookie header (name=value; name2=value2)"
          rows={3}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
        />
        <p className="mt-1 text-xs text-slate-500">
          Paste just the Cookie header value; including &quot;Cookie:&quot; is OK. If you paste a
          full request, we&apos;ll extract the Cookie line automatically.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={saveYoutubeSettings}
          disabled={youtubeSaveStatus === "saving"}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          {youtubeSaveStatus === "saving" ? "Saving..." : "Save YouTube settings"}
        </button>
        {youtubeSaveStatus === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
        {youtubeSaveStatus === "error" && <span className="text-xs text-rose-600">Save failed</span>}
        {youtubeStatus && (
          <span className="text-xs text-slate-500">
            {youtubeStatus.cookiesPath || youtubeStatus.cookiesFromBrowser || youtubeStatus.cookiesHeader
              ? "Cookies configured"
              : "Cookies not configured"}
            {" · "}
            Format:{" "}
            {youtubeStatus.outputFormat === "mp4-remux"
              ? "MP4 (remux)"
              : youtubeStatus.outputFormat === "mp4-recode"
                ? "MP4 (re-encode)"
                : "Original"}
          </span>
        )}
      </div>
    </div>
  );
}

