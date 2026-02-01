import { getIntegrationSettings } from "./settings.js";

type AudioDbArtist = {
  idArtist: string;
  strArtist: string;
  strGenre?: string | null;
  strStyle?: string | null;
  strArtistThumb?: string | null;
};

type AudioDbAlbum = {
  idAlbum: string;
  strAlbum: string;
  intYearReleased?: string | null;
  strReleaseDate?: string | null;
};

type AudioDbDiscography = {
  strAlbum: string;
  intYearReleased?: string | null;
  strYearReleased?: string | null;
};

type AudioDbTrack = {
  idTrack: string;
  strTrack: string;
  intTrackNumber?: string | null;
};

const baseUrl = "https://theaudiodb.com/api/v1/json";
const fallbackApiKey = process.env.AUDIODB_API_KEY ?? "123";
const minRequestDelayMs = 2000;
let lastRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

const resolveApiKey = async () => {
  const { audiodbApiKey } = await getIntegrationSettings();
  return audiodbApiKey || fallbackApiKey;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`AudioDB request failed: ${response.status}`);
  }
  const text = await response.text();
  if (!text || text.trim() === '') {
    throw new Error(`AudioDB returned empty response`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`AudioDB returned invalid JSON: ${text.substring(0, 100)}`);
  }
}

const parseAudioDbYear = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1900 || parsed > 2100) return null;
  return parsed;
};

const debugAlbumYears = process.env.AUDIODB_DEBUG_YEARS === "1";

const rateLimitedFetchJson = async <T>(url: string) => {
  let resolveQueue: (() => void) | null = null;
  const waitForTurn = new Promise<void>((resolve) => {
    resolveQueue = resolve;
  });
  const previous = requestQueue;
  requestQueue = previous.catch(() => undefined).then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, minRequestDelayMs - (now - lastRequestAt));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastRequestAt = Date.now();
    resolveQueue?.();
  });
  await waitForTurn;
  return fetchJson<T>(url);
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export async function searchArtists(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const apiKey = await resolveApiKey();
  const candidates = new Set<string>();
  const lower = trimmed.toLowerCase();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const addCandidate = (value: string) => {
    const normalized = value.trim();
    if (normalized) {
      candidates.add(normalized);
    }
  };
  addCandidate(trimmed);
  if (!lower.startsWith("the ")) {
    addCandidate(`The ${trimmed}`);
  }
  if (lower.startsWith("the ")) {
    addCandidate(trimmed.slice(4));
  }
  if (tokens.length > 1) {
    addCandidate(tokens[0]);
  }
  if (tokens.length > 2) {
    addCandidate(tokens.slice(0, 2).join(" "));
  }

  for (const candidate of candidates) {
    const url = `${baseUrl}/${apiKey}/search.php?s=${encodeURIComponent(candidate)}`;
    const data = await rateLimitedFetchJson<{ artists: AudioDbArtist[] | null }>(url);
    const results = (data.artists ?? []).map((artist) => ({
      id: artist.idArtist,
      name: artist.strArtist,
      genre: artist.strGenre ?? null,
      style: artist.strStyle ?? null,
      thumb: artist.strArtistThumb ?? null
    }));
    if (results.length > 0) {
      return results;
    }
  }

  return [];
}

export async function searchArtistExact(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return [];
  }
  const apiKey = await resolveApiKey();
  const url = `${baseUrl}/${apiKey}/search.php?s=${encodeURIComponent(trimmed)}`;
  const data = await rateLimitedFetchJson<{ artists: AudioDbArtist[] | null }>(url);
  return (data.artists ?? []).map((artist) => ({
    id: artist.idArtist,
    name: artist.strArtist,
    genre: artist.strGenre ?? null,
    style: artist.strStyle ?? null,
    thumb: artist.strArtistThumb ?? null
  }));
}

export async function getArtist(audiodbId: string) {
  const apiKey = await resolveApiKey();
  const url = `${baseUrl}/${apiKey}/artist.php?i=${encodeURIComponent(audiodbId)}`;
  const data = await rateLimitedFetchJson<{ artists: AudioDbArtist[] | null }>(url);
  const artist = data.artists?.[0];
  if (!artist) return null;
  return {
    id: artist.idArtist,
    name: artist.strArtist,
    genre: artist.strGenre ?? null,
    style: artist.strStyle ?? null,
    thumb: artist.strArtistThumb ?? null
  };
}

type AlbumResult = {
  id: string;
  title: string;
  year: number | null;
  source: "theaudiodb" | "discography";
  canFetchTracks: boolean;
};

const mapAlbum = (album: AudioDbAlbum): AlbumResult => {
  const year =
    parseAudioDbYear(album.intYearReleased) ??
    parseAudioDbYear(album.strReleaseDate);
  if (debugAlbumYears && !year) {
    console.log("AudioDB album missing year", {
      title: album.strAlbum,
      intYearReleased: album.intYearReleased,
      strReleaseDate: album.strReleaseDate
    });
  }
  return {
    id: album.idAlbum,
    title: album.strAlbum,
    year,
    source: "theaudiodb",
    canFetchTracks: true
  };
};

const normalizeAlbumTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isUnknownAlbumTitle = (value: string) => {
  const normalized = normalizeAlbumTitle(value);
  if (!normalized) return true;
  return (
    normalized === "unknown" ||
    normalized === "unknown album" ||
    normalized === "n a" ||
    normalized === "na" ||
    normalized === "untitled" ||
    normalized === "none"
  );
};

const parseYearFromTitle = (value: string) => {
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildYearHints = (entries: Array<{ title: string; year: number | null }>) => {
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.year || !Number.isFinite(entry.year)) continue;
    const key = normalizeAlbumTitle(entry.title);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, entry.year);
    }
  }
  return map;
};

const applyAlbumYearHints = (
  albums: AlbumResult[],
  hints: Map<string, number>
) =>
  albums.map((album) => {
    if (album.year && Number.isFinite(album.year)) {
      return album;
    }
    const key = normalizeAlbumTitle(album.title);
    const hinted = hints.get(key) ?? null;
    const parsed = parseYearFromTitle(album.title);
    return {
      ...album,
      year: hinted ?? parsed ?? null
    };
  });

const filterUnknownAlbums = (albums: AlbumResult[]) =>
  albums.filter((album) => !isUnknownAlbumTitle(album.title));

async function getAlbumsByArtistId(audiodbId: string) {
  const apiKey = await resolveApiKey();
  const url = `${baseUrl}/${apiKey}/album.php?i=${encodeURIComponent(audiodbId)}`;
  const data = await rateLimitedFetchJson<{ album: AudioDbAlbum[] | null }>(url);
  return (data.album ?? []).map(mapAlbum);
}

async function getDiscography(artistName: string) {
  const apiKey = await resolveApiKey();
  const url = `${baseUrl}/${apiKey}/discography.php?s=${encodeURIComponent(artistName)}`;
  const data = await rateLimitedFetchJson<{ album: AudioDbDiscography[] | null }>(url);
  return (data.album ?? []).map((album) => {
    const year =
      parseAudioDbYear(album.intYearReleased) ??
      parseAudioDbYear(album.strYearReleased);
    if (debugAlbumYears && !year) {
      console.log("AudioDB discography missing year", {
        title: album.strAlbum,
        intYearReleased: album.intYearReleased,
        strYearReleased: album.strYearReleased
      });
    }
    return { title: album.strAlbum, year };
  });
}

async function getAlbumsBySearch(artistName: string) {
  const apiKey = await resolveApiKey();
  const url = `${baseUrl}/${apiKey}/searchalbum.php?s=${encodeURIComponent(artistName)}`;
  const data = await rateLimitedFetchJson<{ album: AudioDbAlbum[] | null }>(url);
  return (data.album ?? []).map(mapAlbum);
}

async function searchAlbum(artistName: string, albumTitle: string) {
  const apiKey = await resolveApiKey();
  const url = `${baseUrl}/${apiKey}/searchalbum.php?s=${encodeURIComponent(
    artistName
  )}&a=${encodeURIComponent(albumTitle)}`;
  const data = await rateLimitedFetchJson<{ album: AudioDbAlbum[] | null }>(url);
  const album = data.album?.[0];
  return album ? mapAlbum(album) : null;
}

export async function getAlbums(
  audiodbId: string,
  artistName?: string,
  options?: { mode?: "discography" | "new" | "custom" }
) {
  const baseAlbums = filterUnknownAlbums(await getAlbumsByArtistId(audiodbId));
  const baseYearHints = buildYearHints(baseAlbums);
  const baseWithYears = applyAlbumYearHints(baseAlbums, baseYearHints);
  if (!artistName) {
    return baseWithYears;
  }
  if (options?.mode === "new") {
    return baseWithYears;
  }

  const searchedAlbums = filterUnknownAlbums(await getAlbumsBySearch(artistName));
  const discography = await getDiscography(artistName);
  const discographyHints = buildYearHints(discography);
  const searchHints = buildYearHints(searchedAlbums);
  const mergedHints = new Map<string, number>([
    ...discographyHints,
    ...searchHints,
    ...baseYearHints
  ]);
  const baseWithMergedYears = applyAlbumYearHints(baseAlbums, mergedHints);
  const searchedWithYears = applyAlbumYearHints(searchedAlbums, mergedHints);
  if (searchedWithYears.length > baseWithMergedYears.length) {
    return searchedWithYears;
  }
  if (discography.length === 0) {
    return baseWithMergedYears;
  }

  const resolved = await Promise.all(
    discography.map(async (entry) => {
      const found = await searchAlbum(artistName, entry.title);
      if (found) {
        return { ...found, year: found.year ?? entry.year };
      }
      const slug = `${slugify(artistName)}-${slugify(entry.title)}`;
      return {
        id: `discography:${slug}`,
        title: entry.title,
        year: entry.year,
        source: "discography" as const,
        canFetchTracks: false
      };
    })
  );

  const resolvedFiltered = filterUnknownAlbums(resolved);
  const resolvedWithYears = applyAlbumYearHints(resolvedFiltered, mergedHints);
  return resolvedWithYears.length >= baseWithMergedYears.length
    ? resolvedWithYears
    : baseWithMergedYears;
}

export async function getTracks(albumId: string) {
  const apiKey = await resolveApiKey();
  const url = `${baseUrl}/${apiKey}/track.php?m=${encodeURIComponent(albumId)}`;
  const data = await rateLimitedFetchJson<{ track: AudioDbTrack[] | null }>(url);
  return (data.track ?? []).map((track) => ({
    id: track.idTrack,
    title: track.strTrack,
    trackNo: track.intTrackNumber ? Number(track.intTrackNumber) : null
  }));
}
