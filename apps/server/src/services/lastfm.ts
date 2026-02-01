import { getIntegrationSettings } from "./settings.js";

type LastfmTopArtist = {
  name: string;
  mbid?: string | null;
  playcount?: string | null;
  listeners?: string | null;
};

type LastfmArtistSearchResult = {
  name: string;
  mbid?: string | null;
  listeners?: string | null;
  image?: Array<{ "#text": string; size: string }> | null;
};

type LastfmArtistSearchResponse = {
  results?: {
    artistmatches?: {
      artist?: LastfmArtistSearchResult[] | null;
    };
  };
  error?: number;
  message?: string;
};

type LastfmTopArtistsResponse = {
  topartists?: {
    artist?: LastfmTopArtist[] | null;
  };
  error?: number;
  message?: string;
};

type LastfmTag = {
  name: string;
};

type LastfmTopTagsResponse = {
  toptags?: {
    tag?: LastfmTag[] | null;
  };
  error?: number;
  message?: string;
};

const baseUrl = "https://ws.audioscrobbler.com/2.0/";
const fallbackApiKey = process.env.LASTFM_API_KEY;

const tagsCache = new Map<number, { loadedAt: number; tags: string[] }>();
const tagsCacheTtlMs = 60 * 60 * 1000;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Last.fm request failed: ${response.status}`);
  }
  const text = await response.text();
  if (!text || !text.trim()) {
    throw new Error("Last.fm returned empty response");
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Last.fm returned invalid JSON: ${text.substring(0, 200)}`);
  }
}

const resolveApiKey = async () => {
  const { lastfmApiKey } = await getIntegrationSettings();
  return lastfmApiKey || fallbackApiKey || null;
};

const pickImageUrl = (images: Array<{ "#text": string; size: string }> | null | undefined) => {
  const candidates = images ?? [];
  const imageUrl =
    candidates.find((img) => img.size === "extralarge")?.["#text"] ||
    candidates.find((img) => img.size === "large")?.["#text"] ||
    candidates.find((img) => img.size === "mega")?.["#text"] ||
    candidates.find((img) => img.size === "medium")?.["#text"] ||
    null;
  if (!imageUrl) return null;
  return imageUrl.includes("2a96cbd8b46e442fc41c2b86b821562f") ? null : imageUrl;
};

const pickImageUrlAllowPlaceholder = (
  images: Array<{ "#text": string; size: string }> | null | undefined
) => {
  const candidates = images ?? [];
  const imageUrl =
    candidates.find((img) => img.size === "extralarge")?.["#text"] ||
    candidates.find((img) => img.size === "large")?.["#text"] ||
    candidates.find((img) => img.size === "mega")?.["#text"] ||
    candidates.find((img) => img.size === "medium")?.["#text"] ||
    null;
  if (!imageUrl) return null;
  return imageUrl.trim().length > 0 ? imageUrl : null;
};

const parseYearFromDate = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const hasCollabSeparator = (value: string) =>
  /,|\s&\s|\s\+\s|\s\/\s|\s-\s|•/.test(value);

const queryHasSeparator = (value: string) =>
  /,|&|\+|\/|\s-\s|•/.test(value);

const isLikelyArtistResult = (name: string, query: string) => {
  const normalizedName = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedName || !normalizedQuery) {
    return false;
  }
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  if (!queryTokens.every((token) => normalizedName.includes(token))) {
    return false;
  }
  if (/(?:\bfeat\b|\bft\b|\bfeaturing\b|\bvs\b|\bx\b)/i.test(name)) {
    return false;
  }
  if (hasCollabSeparator(name) && !queryHasSeparator(query)) {
    return false;
  }
  return true;
};

export async function hasLastfmKey() {
  const apiKey = await resolveApiKey();
  return Boolean(apiKey);
}

type LastfmArtistInfoResponse = {
  artist?: {
    name?: string;
    mbid?: string | null;
    image?: Array<{ "#text": string; size: string }> | null;
    tags?: { tag?: Array<{ name?: string }> | null } | null;
  };
  error?: number;
  message?: string;
};

type LastfmTopAlbumsResponse = {
  topalbums?: {
    album?: Array<{
      name?: string;
      mbid?: string | null;
      artist?: { name?: string } | string;
      image?: Array<{ "#text": string; size: string }> | null;
    }> | null;
  };
  error?: number;
  message?: string;
};

type LastfmAlbumInfoResponse = {
  album?: {
    name?: string;
    mbid?: string | null;
    artist?: { name?: string } | string;
    releasedate?: string | null;
    tracks?: {
      track?:
        | Array<{ name?: string; mbid?: string | null; "@attr"?: { rank?: string } }>
        | { name?: string; mbid?: string | null; "@attr"?: { rank?: string } }
        | null;
    } | null;
  };
  error?: number;
  message?: string;
};

export async function getArtistInfo(params: {
  name?: string | null;
  mbid?: string | null;
  allowPlaceholder?: boolean;
}) {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return null;
  }
  const name = params.name?.trim();
  const mbid = params.mbid?.trim();
  const allowPlaceholder = params.allowPlaceholder ?? false;
  if (!mbid && !name) {
    return null;
  }
  const query = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name ?? "")}`;
  const url = `${baseUrl}?method=artist.getinfo&${query}&api_key=${encodeURIComponent(
    apiKey
  )}&format=json&autocorrect=1`;
  const debugEnabled = process.env.LASTFM_DEBUG_IMAGES === "1";
  try {
    const data = await fetchJson<LastfmArtistInfoResponse>(url);
    if (data.error || !data.artist) {
      if (debugEnabled) {
        console.log("Last.fm artist.getinfo raw response:", JSON.stringify(data));
      }
      return null;
    }
    const tags = (data.artist.tags?.tag ?? [])
      .map((tag) => tag.name?.trim())
      .filter((value): value is string => Boolean(value));
    const thumb = allowPlaceholder
      ? pickImageUrl(data.artist.image) ?? pickImageUrlAllowPlaceholder(data.artist.image)
      : pickImageUrl(data.artist.image);
    if (debugEnabled && !thumb) {
      console.log("Last.fm artist.getinfo missing image:", JSON.stringify(data));
    }
    return {
      id: data.artist.mbid?.trim() || mbid || name || "",
      name: data.artist.name?.trim() || name || "",
      mbid: data.artist.mbid?.trim() || mbid || null,
      thumb,
      tags
    };
  } catch (error) {
    if (debugEnabled) {
      console.log("Last.fm artist.getinfo error:", error);
    }
    return null;
  }
}

export async function getTopAlbums(
  params: { name?: string | null; mbid?: string | null },
  limit = 50
) {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return [];
  }
  const name = params.name?.trim();
  const mbid = params.mbid?.trim();
  if (!mbid && !name) {
    return [];
  }
  const query = mbid ? `mbid=${encodeURIComponent(mbid)}` : `artist=${encodeURIComponent(name ?? "")}`;
  const url = `${baseUrl}?method=artist.gettopalbums&${query}&api_key=${encodeURIComponent(
    apiKey
  )}&format=json&limit=${limit}`;
  try {
    const data = await fetchJson<LastfmTopAlbumsResponse>(url);
    if (data.error) {
      return [];
    }
    return (data.topalbums?.album ?? []).map((album) => ({
      name: album.name?.trim() ?? "",
      mbid: album.mbid?.trim() || null,
      artistName:
        typeof album.artist === "string" ? album.artist : album.artist?.name?.trim() ?? name ?? "",
      image: pickImageUrl(album.image)
    }));
  } catch {
    return [];
  }
}

export async function getAlbumInfo(params: {
  artistName: string;
  albumName: string;
  mbid?: string | null;
}) {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return null;
  }
  const mbid = params.mbid?.trim();
  const artistName = params.artistName.trim();
  const albumName = params.albumName.trim();
  if (!mbid && (!artistName || !albumName)) {
    return null;
  }
  const query = mbid
    ? `mbid=${encodeURIComponent(mbid)}`
    : `artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(albumName)}`;
  const url = `${baseUrl}?method=album.getinfo&${query}&api_key=${encodeURIComponent(
    apiKey
  )}&format=json`;
  try {
    const data = await fetchJson<LastfmAlbumInfoResponse>(url);
    if (data.error || !data.album) {
      return null;
    }
    const rawTracks = data.album.tracks?.track ?? [];
    const trackArray = Array.isArray(rawTracks) ? rawTracks : [rawTracks];
    const tracks = trackArray
      .map((track) => ({
        id: track.mbid?.trim() || "",
        title: track.name?.trim() ?? null,
        trackNo: track["@attr"]?.rank ? Number(track["@attr"]?.rank) : null
      }))
      .filter((track) => track.title);
    return {
      year: parseYearFromDate(data.album.releasedate ?? null),
      tracks
    };
  } catch {
    return null;
  }
}

export async function searchArtists(query: string, limit = 10) {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return [];
  }
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const url = `${baseUrl}?method=artist.search&artist=${encodeURIComponent(
    trimmed
  )}&api_key=${encodeURIComponent(apiKey)}&format=json&limit=${limit}&autocorrect=1`;
  try {
    const data = await fetchJson<LastfmArtistSearchResponse>(url);
    if (data.error) {
      return [];
    }
    return (data.results?.artistmatches?.artist ?? [])
      .filter((artist) => isLikelyArtistResult(artist.name ?? "", trimmed))
      .map((artist) => {
      // Last.fm returns multiple image sizes, prefer larger ones
      // Image array format: [{ "#text": url, size: "small" | "medium" | "large" | "extralarge" | "mega" }]
      const validImage = pickImageUrl(artist.image) ?? pickImageUrlAllowPlaceholder(artist.image);
      
      return {
        name: artist.name?.trim() ?? "",
        mbid: artist.mbid ?? null,
        listeners: artist.listeners ? parseInt(artist.listeners, 10) : 0,
        image: validImage
      };
    });
  } catch {
    return [];
  }
}

export async function getTopArtistsByTag(tag: string, limit: number) {
  const { lastfmApiKey } = await getIntegrationSettings();
  const apiKey = lastfmApiKey || fallbackApiKey;
  if (!apiKey) {
    throw new Error("LASTFM_API_KEY is not configured");
  }
  const url = `${baseUrl}?method=tag.gettopartists&tag=${encodeURIComponent(
    tag
  )}&api_key=${encodeURIComponent(apiKey)}&format=json&limit=${limit}`;
  const data = await fetchJson<LastfmTopArtistsResponse>(url);
  if (data.error) {
    throw new Error(data.message ?? "Last.fm request failed");
  }
  return (data.topartists?.artist ?? []).map((artist) => ({
    name: artist.name?.trim()
  }));
}

export async function getTopTags(limit: number) {
  const { lastfmApiKey } = await getIntegrationSettings();
  const apiKey = lastfmApiKey || fallbackApiKey;
  if (!apiKey) {
    throw new Error("LASTFM_API_KEY is not configured");
  }
  const cached = tagsCache.get(limit);
  const now = Date.now();
  if (cached && now - cached.loadedAt < tagsCacheTtlMs) {
    return cached.tags;
  }
  const url = `${baseUrl}?method=tag.getTopTags&api_key=${encodeURIComponent(
    apiKey
  )}&format=json`;
  const data = await fetchJson<LastfmTopTagsResponse>(url);
  if (data.error) {
    throw new Error(data.message ?? "Last.fm request failed");
  }
  const tags = (data.toptags?.tag ?? [])
    .map((tag) => tag.name?.trim())
    .filter((name): name is string => Boolean(name));
  const limited = tags.slice(0, limit);
  tagsCache.set(limit, { loadedAt: now, tags: limited });
  return limited;
}
