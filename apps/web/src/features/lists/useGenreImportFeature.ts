import { useEffect, useMemo, useState } from "react";

import type {
  ArtistPreference,
  Genre,
  GenreImportJob,
  GenreImportStartResult
} from "../../app/types";
import { toSentenceCase } from "../../utils/text";

type ApiGet = <T>(path: string, options?: RequestInit) => Promise<T>;
type ApiPost = <T>(path: string, body: unknown) => Promise<T>;
type ApiPut = <T>(path: string, body: unknown) => Promise<T>;
type ApiDelete = (path: string) => Promise<void>;

type Args = {
  canUseApi: boolean;
  genres: Genre[];
  apiGet: ApiGet;
  apiPost: ApiPost;
  apiPut: ApiPut;
  apiDelete: ApiDelete;
  loadAll: () => Promise<void>;
  setError: (message: string | null) => void;
};

export function useGenreImportFeature({
  canUseApi,
  genres,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  loadAll,
  setError
}: Args) {
  const [genreImportId, setGenreImportId] = useState<number | null>(null);
  const [genreImportName, setGenreImportName] = useState("");
  const [genreImportLimit, setGenreImportLimit] = useState(50);
  const [genreImportSource, setGenreImportSource] = useState<"lastfm">("lastfm");
  const [genreImportMode, setGenreImportMode] = useState<ArtistPreference["import_mode"]>("new");
  const [genreImportQuality, setGenreImportQuality] = useState<ArtistPreference["quality"]>("1080p");
  const [genreImportAutoDownload, setGenreImportAutoDownload] = useState(false);
  const [genreImportEnabled, setGenreImportEnabled] = useState(true);
  const [genreImportNotice, setGenreImportNotice] = useState<string | null>(null);
  const [isGenreImporting, setIsGenreImporting] = useState(false);
  const [genreImportJob, setGenreImportJob] = useState<GenreImportJob | null>(null);

  const [lastfmTags, setLastfmTags] = useState<string[]>([]);
  const [lastfmTagsStatus, setLastfmTagsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [lastfmTagsError, setLastfmTagsError] = useState<string | null>(null);

  const configuredGenreImports = useMemo(() => {
    return [...genres]
      .filter(
        (genre) =>
          genre.import_source ||
          genre.import_mode ||
          genre.import_limit ||
          genre.import_quality
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [genres]);

  const lastfmTagOptions = useMemo(() => {
    const options = lastfmTags.map((tag) => toSentenceCase(tag));
    const trimmed = genreImportName.trim();
    if (trimmed) {
      const formatted = toSentenceCase(trimmed);
      const exists = options.some((tag) => tag.toLowerCase() === formatted.toLowerCase());
      if (!exists) {
        options.unshift(formatted);
      }
    }
    const unique = new Map<string, string>();
    for (const tag of options) {
      const key = tag.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, tag);
      }
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }, [lastfmTags, genreImportName]);

  const isGenreImportRunning = useMemo(() => {
    return genreImportJob ? genreImportJob.status === "queued" || genreImportJob.status === "running" : false;
  }, [genreImportJob]);

  const genreImportProgress = useMemo(() => {
    if (!genreImportJob || genreImportJob.total === 0) return 0;
    return Math.min(100, Math.round((genreImportJob.processed / genreImportJob.total) * 100));
  }, [genreImportJob]);

  const resetGenreImportForm = () => {
    setGenreImportId(null);
    setGenreImportName("");
    setGenreImportLimit(50);
    setGenreImportSource("lastfm");
    setGenreImportMode("new");
    setGenreImportQuality("1080p");
    setGenreImportAutoDownload(false);
    setGenreImportEnabled(true);
  };

  const editGenreImport = (genre: Genre) => {
    setGenreImportId(genre.id);
    setGenreImportName(genre.name);
    setGenreImportLimit(genre.import_limit ?? 50);
    setGenreImportSource((genre.import_source as "lastfm") ?? "lastfm");
    setGenreImportMode(genre.import_mode ?? "new");
    setGenreImportQuality(genre.import_quality ?? "1080p");
    setGenreImportAutoDownload(genre.import_auto_download ?? false);
    setGenreImportEnabled(genre.import_enabled ?? true);
  };

  const selectGenreImportTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      resetGenreImportForm();
      return;
    }
    const existing = genres.find((genre) => genre.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      editGenreImport(existing);
      return;
    }
    setGenreImportId(null);
    setGenreImportName(trimmed);
  };

  const loadLastfmTags = async () => {
    if (!canUseApi) return;
    setLastfmTagsStatus("loading");
    try {
      const result = await apiGet<{ tags: string[] }>("/api/genres/tags?limit=1000");
      setLastfmTags(result.tags);
      setLastfmTagsError(null);
      setLastfmTagsStatus("idle");
    } catch (err) {
      setLastfmTags([]);
      setLastfmTagsStatus("error");
      setLastfmTagsError(err instanceof Error ? err.message : "Failed to load Last.fm tags");
    }
  };

  const loadGenreImportJob = async (jobId: string) => {
    if (!canUseApi) return;
    try {
      const job = await apiGet<GenreImportJob>(`/api/genres/import/jobs/${jobId}`);
      setGenreImportJob(job);
      if (job.status === "completed" || job.status === "failed") {
        await loadAll();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load import job");
    }
  };

  useEffect(() => {
    if (canUseApi) {
      void loadLastfmTags();
    }
  }, [canUseApi]);

  useEffect(() => {
    if (!canUseApi) return;
    if (!genreImportJob?.id) return;
    if (genreImportJob.status !== "queued" && genreImportJob.status !== "running") {
      return;
    }
    const interval = window.setInterval(() => {
      void loadGenreImportJob(genreImportJob.id);
    }, 1500);
    return () => {
      window.clearInterval(interval);
    };
  }, [canUseApi, genreImportJob?.id, genreImportJob?.status]);

  useEffect(() => {
    if (!genreImportNotice) return;
    const timer = setTimeout(() => setGenreImportNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [genreImportNotice]);

  const saveGenreImportSettings = async () => {
    const trimmed = genreImportName.trim();
    if (!trimmed) return;
    setError(null);
    try {
      let id = genreImportId;
      if (!id) {
        const existing = genres.find((genre) => genre.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) {
          id = existing.id;
          setGenreImportId(existing.id);
        } else {
          const created = await apiPost<Genre>("/api/genres", { name: trimmed });
          id = created.id;
          setGenreImportId(created.id);
        }
      }
      if (!id) return;
      await apiPut<Genre>(`/api/genres/${id}/import`, {
        source: genreImportSource,
        limit: genreImportLimit,
        importMode: genreImportMode,
        quality: genreImportQuality,
        autoDownload: genreImportAutoDownload,
        enabled: genreImportEnabled
      });
      setGenreImportNotice(`Saved settings for ${trimmed}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save genre settings");
    }
  };

  const deleteGenreImportSettings = async (genreId: number, name: string) => {
    const confirmed = window.confirm(`Remove import settings for ${name}?`);
    if (!confirmed) return;
    try {
      await apiDelete(`/api/genres/${genreId}/import`);
      if (genreImportId === genreId) {
        resetGenreImportForm();
      }
      if (genreImportJob?.genre_id === genreId) {
        setGenreImportJob(null);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete genre import settings");
    }
  };

  const runGenreImport = async (options: {
    name: string;
    source: "lastfm";
    limit: number;
    importMode: ArtistPreference["import_mode"];
    quality: ArtistPreference["quality"];
    autoDownload: boolean;
    enabled: boolean;
  }) => {
    const trimmed = options.name.trim();
    if (!trimmed || isGenreImporting) return;
    setError(null);
    setIsGenreImporting(true);
    try {
      const result = await apiPost<GenreImportStartResult>("/api/genres/import", {
        source: options.source,
        genre: trimmed,
        limit: options.limit,
        importMode: options.importMode,
        quality: options.quality,
        autoDownload: options.autoDownload,
        enabled: options.enabled,
        async: true
      });
      setGenreImportNotice(`Queued import for ${trimmed} (${result.total} artists).`);
      setGenreImportJob({
        id: result.jobId,
        genre_id: null,
        genre_name: trimmed,
        source: options.source,
        limit: options.limit,
        import_mode: options.importMode,
        import_quality: options.quality,
        auto_download: options.autoDownload,
        enabled: options.enabled,
        status: "queued",
        processed: 0,
        total: result.total,
        imported: 0,
        skipped: 0,
        errors: 0,
        error_samples: null,
        started_at: null,
        finished_at: null
      });
      void loadGenreImportJob(result.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import genre artists");
    } finally {
      setIsGenreImporting(false);
    }
  };

  const importGenreArtists = async () => {
    await runGenreImport({
      name: genreImportName,
      source: genreImportSource,
      limit: genreImportLimit,
      importMode: genreImportMode,
      quality: genreImportQuality,
      autoDownload: genreImportAutoDownload,
      enabled: genreImportEnabled
    });
  };

  return {
    // state
    genreImportId,
    setGenreImportId,
    genreImportName,
    setGenreImportName,
    genreImportLimit,
    setGenreImportLimit,
    genreImportSource,
    setGenreImportSource,
    genreImportMode,
    setGenreImportMode,
    genreImportQuality,
    setGenreImportQuality,
    genreImportAutoDownload,
    setGenreImportAutoDownload,
    genreImportEnabled,
    setGenreImportEnabled,
    genreImportNotice,
    isGenreImporting,
    genreImportJob,
    lastfmTagsStatus,
    lastfmTagsError,

    // derived
    configuredGenreImports,
    lastfmTagOptions,
    isGenreImportRunning,
    genreImportProgress,

    // actions
    resetGenreImportForm,
    editGenreImport,
    selectGenreImportTag,
    saveGenreImportSettings,
    deleteGenreImportSettings,
    runGenreImport,
    importGenreArtists,
    loadLastfmTags
  };
}

