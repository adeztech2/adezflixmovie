export const API_BASE = import.meta.env?.VITE_CATALOG_API_BASE?.trim() || "https://davextechmovieapi.fly.dev";

type JsonRecord = Record<string, unknown>;

export type MediaItem = {
  id: string;
  title: string;
  originalTitle?: string;
  type?: string;
  synopsis?: string;
  year?: string;
  releaseDate?: string;
  duration?: string;
  rating?: string;
  poster?: string;
  cover?: string;
  genres: string[];
  country?: string;
  hasResource?: boolean;
  source: JsonRecord;
};

export type CatalogSection = {
  title: string;
  type?: string;
  items: MediaItem[];
};

export type CaptionTrack = {
  id: string;
  label: string;
  language: string;
  url: string;
  format: "vtt" | "srt" | "unknown";
};

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

export async function apiGet<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  let raw: string;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    response = await fetch(apiUrl(path), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    raw = await response.text();
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    if (controller.signal.aborted) throw new ApiError("The ADEZ FLIX catalog request timed out. Try again shortly.");
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Could not connect to the ADEZ FLIX catalog. Check your connection and try again.");
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }

  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = raw;
  }

  if (!response.ok) {
    const message = readMessage(body) || `The catalog returned an error (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  if (isRecord(body) && body.success === false) {
    throw new ApiError(readMessage(body) || "The catalog could not complete that request.", response.status);
  }
  return body as T;
}

export function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return typeof value === "string" ? value : undefined;
  for (const key of ["detail", "message", "error", "reason"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function imageFrom(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (!isRecord(value)) return undefined;
  return firstText(value.url, value.src, value.poster_url, value.image_url);
}

function genreList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((part) => String(part).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,|]/).map((part) => part.trim()).filter(Boolean);
  return [];
}

export function normalizeMedia(value: unknown): MediaItem | null {
  if (!isRecord(value)) return null;
  const id = firstText(value.subject_id, value.subjectId, value.id, value.subjectID, value.video_id);
  const title = firstText(value.title, value.name, value.subject_title, value.original_title);
  if (!id || !title) return null;

  const coverObject = isRecord(value.cover) ? value.cover : undefined;
  const poster = firstText(value.poster_url, value.poster, value.image_url, value.thumbnail_url) || imageFrom(coverObject);
  const cover = firstText(value.cover_url, value.landscape_url, value.backdrop_url) || imageFrom(value.backdrop) || imageFrom(value.cover);
  const typeRaw = firstText(value.type, value.content_type, value.subject_type_name, value.subjectType, value.subject_type);
  const typeNumber = Number(typeRaw);
  const type = typeRaw && Number.isFinite(typeNumber)
    ? ({ 1: "MOVIE", 2: "TV_SERIES", 3: "ANIME", 6: "MUSIC", 7: "ANIME" }[typeNumber] ?? typeRaw)
    : typeRaw;
  const rating = firstText(value.imdb_rating, value.rating, value.score, value.average_rating);
  const synopsis = firstText(value.description, value.synopsis, value.introduction, value.overview);
  const releaseDate = firstText(value.release_date, value.releaseDate, value.date);

  return {
    id,
    title,
    originalTitle: firstText(value.original_title, value.originalTitle),
    type,
    synopsis,
    year: firstText(value.year, releaseDate?.slice(0, 4)),
    releaseDate,
    duration: firstText(value.duration, value.runtime),
    rating,
    poster,
    cover,
    genres: genreList(value.genre ?? value.genres),
    country: firstText(value.country_name, value.country),
    hasResource: typeof value.has_resource === "boolean" ? value.has_resource : undefined,
    source: value,
  };
}

const ARRAY_KEYS = new Set([
  "results", "items", "list", "subjects", "movies", "series", "episodes", "records",
  "hot", "new", "explore", "trending", "data", "recommendations", "recommend",
]);

export function extractMedia(value: unknown): MediaItem[] {
  const found = new Map<string, MediaItem>();
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 7 || !node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) {
        const item = normalizeMedia(child);
        if (item) found.set(item.id, item);
        else walk(child, depth + 1);
      }
      return;
    }
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      if (Array.isArray(child) && (ARRAY_KEYS.has(key.toLowerCase()) || key.toLowerCase().includes("section"))) {
        walk(child, depth + 1);
      } else if (isRecord(child)) {
        walk(child, depth + 1);
      }
    }
  };
  walk(value, 0);
  return [...found.values()];
}

export function extractSections(value: unknown): CatalogSection[] {
  if (!isRecord(value)) return [];
  const sectionsValue = value.sections ?? (isRecord(value.data) ? value.data.sections : undefined);
  if (!Array.isArray(sectionsValue)) return [];
  return sectionsValue.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const items = extractMedia(entry.items ?? entry.results ?? entry.data);
    if (!items.length) return [];
    return [{
      title: firstText(entry.section_title, entry.title, entry.name, entry.section_name) || "Explore more",
      type: firstText(entry.section_type, entry.type),
      items,
    }];
  });
}

export function extractPrimary(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) return value.map(extractPrimary).find(Boolean);
  const record = value as JsonRecord;
  if ((record.title || record.name || record.subject_title) && (record.subject_id || record.subjectId || record.id || record.subject)) {
    if (isRecord(record.subject)) return { ...record.subject, ...record };
    return record;
  }
  for (const key of ["data", "subject", "item", "detail", "result", "movie", "series", "info"]) {
    if (record[key]) {
      const found = extractPrimary(record[key]);
      if (found) return found;
    }
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      const found = extractPrimary(nested);
      if (found) return found;
    }
  }
  return undefined;
}

export function extractCaptionTracks(value: unknown): CaptionTrack[] {
  const tracks: CaptionTrack[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry) => walk(entry, depth + 1));
      return;
    }
    const record = node as JsonRecord;
    const sourceUrl = firstText(record.sourceUrl, record.source_url, record.url, record.file_url, record.caption_url, record.subtitle_url, record.src, record.download_url, record.link);
    const url = firstText(record.proxyUrl, record.proxy_url, record.downloadUrl, sourceUrl);
    const language = firstText(record.lanName, record.language_name, record.language, record.lang, record.label, record.name) || "Unknown language";
    if (url && /https?:\/\//i.test(url) && /(caption|subtitle|\.vtt|\.srt|\.ass|\.ssa)/i.test(`${url} ${record.format ?? ""} ${record.type ?? ""}`)) {
      if (!seen.has(url)) {
        seen.add(url);
        const formatText = `${sourceUrl ?? ""} ${url} ${record.format ?? ""} ${record.type ?? ""} ${record.file_type ?? ""}`;
        const format = /\.vtt(?:$|\?)/i.test(formatText) || String(record.format).toLowerCase() === "vtt" ? "vtt" : /\.srt(?:$|\?)/i.test(formatText) || String(record.format).toLowerCase() === "srt" ? "srt" : "unknown";
        tracks.push({ id: url, label: language, language: firstText(record.lan, record.language_code, record.lang_code, record.lang) || "und", url, format });
      }
    }
    for (const [key, child] of Object.entries(record)) {
      if (Array.isArray(child) || isRecord(child)) walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return tracks;
}

export function posterFrom(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const cover = isRecord(value.cover) ? value.cover : undefined;
  return firstText(value.poster_url, value.poster, value.image_url, value.thumbnail_url) || imageFrom(cover) || imageFrom(value.cover);
}

export function castNames(value: unknown): string[] {
  const names: string[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 5 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const person of node) {
        if (isRecord(person)) {
          const name = firstText(person.name, person.cast_name, person.actor_name, person.title);
          if (name) names.push(name);
        } else if (typeof person === "string") names.push(person);
      }
      return;
    }
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      if (["cast", "actors", "crew", "people", "persons"].includes(key.toLowerCase())) walk(child, depth + 1);
      else if (isRecord(child) && depth < 2) walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return [...new Set(names)].slice(0, 12);
}

export function findNestedArrays(value: unknown, candidateNames: string[]): unknown[] {
  const candidates = new Set(candidateNames.map((name) => name.toLowerCase()));
  const found: unknown[] = [];
  const visited = new Set<unknown>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object" || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      return;
    }
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      if (Array.isArray(child) && (candidates.has(key.toLowerCase()) || candidateNames.some((name) => key.toLowerCase().includes(name.toLowerCase())))) found.push(child);
      else if (isRecord(child)) walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return found;
}

export function extractPlaybackUrl(value: unknown): string | undefined {
  const urlKeys = new Set(["url", "stream_url", "streamurl", "play_url", "playurl", "playback_url", "playbackurl", "video_url", "videourl", "live_url", "liveurl", "live_stream_url", "file_url", "src", "hls_url", "hlsurl", "mp4_url", "mp4url"]);
  const visited = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | undefined => {
    if (depth > 7 || !node || typeof node !== "object" || visited.has(node)) return undefined;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const child of node) {
        const result = walk(child, depth + 1);
        if (result) return result;
      }
      return undefined;
    }
    const record = node as JsonRecord;
    for (const [key, child] of Object.entries(record)) {
      if (urlKeys.has(key.toLowerCase().replace(/[-]/g, "_")) && typeof child === "string" && /^https?:\/\//i.test(child)) return child;
    }
    for (const child of Object.values(record)) {
      const result = walk(child, depth + 1);
      if (result) return result;
    }
    return undefined;
  };
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : walk(value, 0);
}

export type AudioLanguage = { label: string; code?: string; subjectId?: string; original?: boolean };

export function extractAudioLanguages(value: unknown): AudioLanguage[] {
  const rows = findNestedArrays(value, ["dubs", "audio_languages", "audioLanguages", "dubbing_languages"])
    .flatMap((entry) => Array.isArray(entry) ? entry.filter(isRecord) : []);
  const result = new Map<string, AudioLanguage>();
  for (const row of rows) {
    const label = firstText(row.lan_name, row.language_name, row.language, row.name, row.label);
    if (!label || Number(row.type) === 1 || /\bsub(?:title)?\b/i.test(label)) continue;
    const code = firstText(row.lan_code, row.language_code, row.code);
    const subjectId = firstText(row.subject_id, row.subjectId);
    result.set(`${code || label}:${subjectId || ""}`, {
      label,
      code,
      subjectId,
      original: row.original === true,
    });
  }
  return [...result.values()];
}

export function extractSubtitleLanguages(value: unknown): string[] {
  const labels = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry) => {
        if (typeof entry === "string" && entry.trim()) labels.add(entry.trim());
        else walk(entry, depth + 1);
      });
      return;
    }
    for (const [key, child] of Object.entries(node as JsonRecord)) {
      const lowered = key.toLowerCase();
      if (["subtitle_languages", "subtitlelanguages", "caption_languages"].includes(lowered) && Array.isArray(child)) {
        child.forEach((entry) => {
          if (typeof entry === "string" && entry.trim()) labels.add(entry.trim());
          else if (isRecord(entry)) {
            const label = firstText(entry.lan_name, entry.language_name, entry.language, entry.name, entry.label);
            if (label) labels.add(label);
          }
        });
      } else if ((lowered === "dubs" || lowered.includes("dub")) && Array.isArray(child)) {
        child.filter(isRecord).forEach((entry) => {
          const label = firstText(entry.lan_name, entry.language_name, entry.language, entry.name);
          if (Number(entry.type) === 1 && label) labels.add(label);
        });
      } else if (isRecord(child)) walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return [...labels];
}

export function extractResolutions(value: unknown, episode?: number): number[] {
  const found = new Set<number>();
  const supported = new Set([360, 480, 720, 1080]);
  const seen = new Set<unknown>();
  const addResolution = (raw: unknown) => {
    const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.match(/\d{3,4}/)?.[0]) : NaN;
    if (supported.has(parsed)) found.add(parsed);
  };
  const walk = (node: unknown, depth: number) => {
    if (depth > 8 || !node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((entry) => walk(entry, depth + 1));
      return;
    }
    const row = node as JsonRecord;
    const entryEpisode = Number(row.episode ?? row.episode_number ?? row.ep);
    const episodeMatches = episode === undefined || !Number.isFinite(entryEpisode) || entryEpisode === episode;
    const raw = row.resolution ?? row.resolution_name;
    if (episodeMatches) {
      addResolution(raw);
      for (const [key, child] of Object.entries(row)) {
        if (/(available_)?(qualities|resolutions)|quality_levels/i.test(key)) {
          (Array.isArray(child) ? child : [child]).forEach(addResolution);
        }
      }
    }
    Object.values(row).forEach((child) => walk(child, depth + 1));
  };
  walk(value, 0);
  return [...found].sort((a, b) => b - a);
}

export function directorNames(value: unknown): string[] {
  const names = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry) => walk(entry, depth + 1));
      return;
    }
    const row = node as JsonRecord;
    for (const [key, child] of Object.entries(row)) {
      if (key.toLowerCase() === "director") {
        const values = Array.isArray(child) ? child : [child];
        values.forEach((person) => {
          const name = typeof person === "string" ? person : isRecord(person) ? firstText(person.name, person.director_name, person.title) : undefined;
          if (name) names.add(name);
        });
      } else if (key.toLowerCase() === "crew" && Array.isArray(child)) {
        child.filter(isRecord).forEach((person) => {
          if (/director/i.test(firstText(person.job, person.role, person.department) || "")) {
            const name = firstText(person.name, person.director_name, person.title);
            if (name) names.add(name);
          }
        });
      } else if (isRecord(child)) walk(child, depth + 1);
    }
  };
  walk(value, 0);
  return [...names].slice(0, 8);
}

export function displayType(type?: string): string {
  const normalized = type?.toUpperCase();
  if (normalized?.includes("LIVE") || normalized?.includes("EVENT")) return "Live";
  if (normalized?.includes("TV") || normalized?.includes("SERIES")) return "Series";
  if (normalized?.includes("ANIME") || normalized?.includes("ANIMATION")) return "Anime";
  if (normalized?.includes("MUSIC")) return "Music";
  if (normalized?.includes("EDUCATION")) return "Documentary";
  return "Movie";
}
