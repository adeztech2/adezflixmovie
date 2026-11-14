import type { MediaItem } from "@/lib/adezflix-api";

const LIST_KEY = "adezflix:v1:list";
const HISTORY_KEY = "adezflix:v1:history";
const SEARCH_KEY = "adezflix:v1:searches";
const CHANGE_EVENT = "adezflix:local-library-change";

export type WatchProgress = {
  item: MediaItem;
  position: number;
  duration: number;
  season?: number;
  episode?: number;
  updatedAt: number;
};

function compactItem(item: MediaItem): MediaItem {
  return {
    id: item.id,
    title: item.title,
    originalTitle: item.originalTitle,
    type: item.type,
    synopsis: item.synopsis,
    year: item.year,
    releaseDate: item.releaseDate,
    duration: item.duration,
    rating: item.rating,
    poster: item.poster,
    cover: item.cover,
    genres: Array.isArray(item.genres) ? item.genres.slice(0, 12) : [],
    country: item.country,
    hasResource: item.hasResource,
    source: {},
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Private browsing or storage limits should not break catalog browsing.
  }
}

function validItem(value: unknown): value is MediaItem {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.title === "string" && Array.isArray(record.genres);
}

export function getMyList(): MediaItem[] {
  const values = readJson<unknown[]>(LIST_KEY, []);
  return Array.isArray(values) ? values.filter(validItem) : [];
}

export function isInMyList(id: string): boolean {
  return getMyList().some((item) => item.id === id);
}

export function toggleMyList(item: MediaItem): boolean {
  const existing = getMyList();
  const alreadySaved = existing.some((saved) => saved.id === item.id);
  const next = alreadySaved ? existing.filter((saved) => saved.id !== item.id) : [compactItem(item), ...existing].slice(0, 200);
  writeJson(LIST_KEY, next);
  return !alreadySaved;
}

export function getWatchHistory(): WatchProgress[] {
  const values = readJson<unknown[]>(HISTORY_KEY, []);
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is WatchProgress => {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return validItem(record.item) && typeof record.position === "number" && typeof record.duration === "number";
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getContinueWatching(): WatchProgress[] {
  return getWatchHistory().filter((entry) => entry.position > 3 && entry.duration > 0 && entry.position / entry.duration < 0.95);
}

export function saveWatchProgress(progress: Omit<WatchProgress, "updatedAt">): void {
  if (!Number.isFinite(progress.position) || progress.position < 0 || !Number.isFinite(progress.duration) || progress.duration <= 0) return;
  const item = compactItem(progress.item);
  const identity = `${item.id}:${progress.season ?? 0}:${progress.episode ?? 0}`;
  const remaining = getWatchHistory().filter((entry) => `${entry.item.id}:${entry.season ?? 0}:${entry.episode ?? 0}` !== identity);
  writeJson(HISTORY_KEY, [{ ...progress, item, updatedAt: Date.now() }, ...remaining].slice(0, 100));
}

export function clearWatchHistory(): void {
  writeJson(HISTORY_KEY, []);
}

export function getSearchHistory(): string[] {
  const values = readJson<unknown[]>(SEARCH_KEY, []);
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string").slice(0, 8) : [];
}

export function addSearchHistory(query: string): void {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!normalized) return;
  const next = [normalized, ...getSearchHistory().filter((term) => term.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
  writeJson(SEARCH_KEY, next);
}

export function subscribeLocalLibrary(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
