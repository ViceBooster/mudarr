const searchStopwords = new Set(["the", "a", "an", "and", "of", "&"]);

export const normalizeTokens = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export const matchesArtistQuery = (name: string, query: string) => {
  const queryTokens = normalizeTokens(query).filter((token) => !searchStopwords.has(token));
  if (queryTokens.length === 0) {
    return true;
  }
  const nameTokens = normalizeTokens(name);
  return queryTokens.every((token) => nameTokens.some((nameToken) => nameToken.startsWith(token)));
};

export const toSentenceCase = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  return normalized[0].toUpperCase() + normalized.slice(1);
};

