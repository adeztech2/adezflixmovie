import {
  ApiError,
  apiGet,
  extractCaptionTracks,
  extractPlaybackUrl,
  extractResolutions,
  type CaptionTrack,
} from "@/lib/adezflix-api";

export type PlaybackKind = "movie" | "tv" | "anime" | "live";

export type PlaybackRequest = {
  subjectId: string;
  contentType: string;
  season?: number;
  episode?: number;
  resolution?: number;
};

export type PlaybackSource = {
  url: string;
  resolution?: number;
  requestedResolution: number;
  availableResolutions: number[];
  payload: unknown;
};

export const DOCUMENTED_RESOLUTIONS = [1080, 720, 480, 360] as const;

export function getPlaybackKind(contentType?: string): PlaybackKind | null {
  const value = String(contentType || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!value || value === "1" || value.includes("MOVIE") || value === "FILM") return "movie";
  if (value === "2" || value.includes("TV") || value.includes("SERIES") || value.includes("SHORT_TV")) return "tv";
  if (value === "3" || value === "7" || value.includes("ANIME") || value.includes("ANIMATION")) return "anime";
  if (value.includes("LIVE") || value.includes("EVENT")) return "live";
  return null;
}

export function defaultResolution(contentType: string): number {
  return getPlaybackKind(contentType) === "anime" ? 720 : 1080;
}

function safeResolution(value: number | undefined, contentType: string): number {
  return DOCUMENTED_RESOLUTIONS.includes(value as (typeof DOCUMENTED_RESOLUTIONS)[number])
    ? value as number
    : defaultResolution(contentType);
}

export function buildStreamRequestPath(request: PlaybackRequest, resolution = safeResolution(request.resolution, request.contentType)): string {
  const kind = getPlaybackKind(request.contentType);
  if (!kind) throw new Error("This catalog category does not have a documented playback endpoint.");
  const id = encodeURIComponent(request.subjectId);
  const params = new URLSearchParams({ resolution: String(safeResolution(resolution, request.contentType)) });
  if (kind === "tv" && (!request.season || !request.episode)) {
    throw new Error("Select a season and episode before playing this TV title.");
  }
  if ((kind === "tv" || kind === "anime") && request.season && request.episode) {
    params.set("season", String(request.season));
    params.set("episode", String(request.episode));
  }
  if (kind === "movie") return `/movie/stream/${id}?${params}`;
  if (kind === "tv") return `/tv/episode/stream/${id}?${params}`;
  if (kind === "anime") return `/anime/stream/${id}?${params}`;
  return `/live/stream/${id}?${params}`;
}

function responseResolution(value: unknown): number | undefined {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): number | undefined => {
    if (depth > 7 || !node || typeof node !== "object" || seen.has(node)) return undefined;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) {
        const result = walk(child, depth + 1);
        if (result) return result;
      }
      return undefined;
    }
    const row = node as Record<string, unknown>;
    for (const key of ["resolution", "selected_resolution", "quality", "selected_quality"]) {
      const raw = row[key];
      const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.match(/\d{3,4}/)?.[0]) : NaN;
      if (DOCUMENTED_RESOLUTIONS.includes(parsed as (typeof DOCUMENTED_RESOLUTIONS)[number])) return parsed;
    }
    for (const child of Object.values(row)) {
      const result = walk(child, depth + 1);
      if (result) return result;
    }
    return undefined;
  };
  return walk(value, 0);
}

class MissingPlaybackUrlError extends Error {
  constructor() {
    super("The API response did not include a playable media URL.");
    this.name = "MissingPlaybackUrlError";
  }
}

function canTryLowerQuality(error: unknown): boolean {
  if (error instanceof MissingPlaybackUrlError) return true;
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404 || (error.status !== undefined && error.status >= 500)) return true;
  if (error.status === 200) return !/(unauthori[sz]ed|forbidden|permission|access denied)/i.test(error.message);
  return false;
}

export async function loadPlaybackSource(request: PlaybackRequest, signal?: AbortSignal): Promise<PlaybackSource> {
  const selected = safeResolution(request.resolution, request.contentType);
  const fallback = DOCUMENTED_RESOLUTIONS.filter((quality) => quality < selected);
  const attempts = [selected, ...fallback];
  let lastError: unknown;

  for (const quality of attempts) {
    try {
      const payload = await apiGet<unknown>(buildStreamRequestPath(request, quality), signal);
      const url = extractPlaybackUrl(payload);
      if (!url) throw new MissingPlaybackUrlError();
      const actual = responseResolution(payload);
      const available = extractResolutions(payload);
      return {
        url,
        resolution: actual,
        requestedResolution: quality,
        availableResolutions: available.length ? available : [...DOCUMENTED_RESOLUTIONS],
        payload,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      lastError = error;
      if (!canTryLowerQuality(error)) break;
    }
  }

  if (lastError instanceof ApiError && (lastError.status === 401 || lastError.status === 403)) {
    throw new Error("The provider did not authorize this stream. ADEZ FLIX did not try an alternate or restricted source.");
  }
  if (lastError instanceof ApiError && lastError.status === 404) {
    throw new Error("No playable stream is currently available for this title. Try another title or check again later.");
  }
  if (lastError instanceof MissingPlaybackUrlError) {
    throw new Error("The provider did not return a playable media URL at any available quality. Try another title or retry later.");
  }
  if (lastError instanceof Error && !(lastError instanceof ApiError)) throw lastError;
  throw new Error("The provider stream is temporarily unavailable. Please retry in a moment.");
}

function readStreamId(payload: unknown): string | undefined {
  const keys = new Set(["stream_id", "streamid", "streamID"].map((key) => key.toLowerCase()));
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | undefined => {
    if (depth > 7 || !node || typeof node !== "object" || seen.has(node)) return undefined;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) {
        const result = walk(child, depth + 1);
        if (result) return result;
      }
      return undefined;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (keys.has(key.toLowerCase()) && (typeof child === "string" || typeof child === "number")) return String(child);
    }
    for (const child of Object.values(node as Record<string, unknown>)) {
      const result = walk(child, depth + 1);
      if (result) return result;
    }
    return undefined;
  };
  return walk(payload, 0);
}

function autoCaptionPath(request: PlaybackRequest, resolution: number): string {
  const id = encodeURIComponent(request.subjectId);
  if (getPlaybackKind(request.contentType) === "anime") {
    const params = new URLSearchParams({ resolution: String(resolution) });
    if (request.season) params.set("season", String(request.season));
    if (request.episode) params.set("episode", String(request.episode));
    return `/anime/captions/${id}?${params}`;
  }
  return `/item/${id}/captions/auto?resolution=${encodeURIComponent(String(resolution))}`;
}

export function buildCaptionRequestPaths(request: PlaybackRequest, streamPayload?: unknown): string[] {
  const paths: string[] = [];
  const kind = getPlaybackKind(request.contentType);
  const resolution = safeResolution(request.resolution, request.contentType);
  const streamId = readStreamId(streamPayload);
  if (streamId) {
    const params = new URLSearchParams({ subjectId: request.subjectId, streamId });
    paths.push(`/captions?${params}`);
  }
  if (kind === "anime") paths.push(autoCaptionPath(request, resolution));
  else paths.push(autoCaptionPath(request, resolution));
  return [...new Set(paths)];
}

export async function loadCaptionTracks(request: PlaybackRequest, streamPayload?: unknown, signal?: AbortSignal): Promise<CaptionTrack[]> {
  for (const path of buildCaptionRequestPaths(request, streamPayload)) {
    try {
      const payload = await apiGet<unknown>(path, signal);
      const tracks = extractCaptionTracks(payload);
      if (tracks.length) return tracks;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
  }
  return [];
}

export async function fetchCaptionText(track: CaptionTrack, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(track.url, {
      headers: { Accept: "text/vtt, text/plain, */*" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("A subtitle track could not be loaded.");
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("The subtitle file is too large to display.");
    return text;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    if (controller.signal.aborted) throw new Error("Subtitle loading timed out.");
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw error instanceof Error ? error : new Error("A subtitle track could not be loaded.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function subtitleToVtt(source: string): string {
  const cleaned = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!cleaned) throw new Error("The subtitle file is empty.");
  if (/^WEBVTT(?:\s|$)/m.test(cleaned)) return `${cleaned}\n`;
  const converted = cleaned.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  if (!converted.includes("-->")) throw new Error("The subtitle format is not supported by this browser.");
  return `WEBVTT\n\n${converted}\n`;
}
