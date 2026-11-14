import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCaptionRequestPaths,
  buildStreamRequestPath,
  getPlaybackKind,
  loadPlaybackSource,
  subtitleToVtt,
} from "../client/src/lib/playback";

afterEach(() => vi.unstubAllGlobals());

describe("documented playback routes", () => {
  it("builds a movie stream request with a selectable resolution", () => {
    expect(buildStreamRequestPath({ subjectId: "film-1", contentType: "MOVIE", resolution: 720 }))
      .toBe("/movie/stream/film-1?resolution=720");
  });

  it("requires season and episode for TV playback", () => {
    expect(() => buildStreamRequestPath({ subjectId: "show-1", contentType: "TV_SERIES", resolution: 1080 }))
      .toThrow("Select a season and episode");
    expect(buildStreamRequestPath({ subjectId: "show-1", contentType: "TV_SERIES", season: 2, episode: 4, resolution: 1080 }))
      .toBe("/tv/episode/stream/show-1?resolution=1080&season=2&episode=4");
  });

  it("includes optional anime episode context and selects the anime route", () => {
    expect(buildStreamRequestPath({ subjectId: "anime-1", contentType: "ANIME", season: 1, episode: 3, resolution: 720 }))
      .toBe("/anime/stream/anime-1?resolution=720&season=1&episode=3");
  });

  it("uses the live stream route and rejects undocumented types", () => {
    expect(buildStreamRequestPath({ subjectId: "event-1", contentType: "LIVE_EVENT", resolution: 1080 }))
      .toBe("/live/stream/event-1?resolution=1080");
    expect(getPlaybackKind("MUSIC")).toBeNull();
    expect(() => buildStreamRequestPath({ subjectId: "audio-1", contentType: "MUSIC" })).toThrow("does not have a documented playback endpoint");
  });

  it("uses stream-specific captions where the provider returns a stream id", () => {
    expect(buildCaptionRequestPaths(
      { subjectId: "film-1", contentType: "MOVIE", resolution: 1080 },
      { data: { stream_id: "stream-7" } },
    )).toEqual([
      "/captions?subjectId=film-1&streamId=stream-7",
      "/item/film-1/captions/auto?resolution=1080",
    ]);
  });

  it("converts SRT timestamps to WebVTT and preserves a valid VTT header", () => {
    expect(subtitleToVtt("1\n00:00:01,250 --> 00:00:02,500\nHello"))
      .toBe("WEBVTT\n\n1\n00:00:01.250 --> 00:00:02.500\nHello\n");
    expect(subtitleToVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello"))
      .toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello\n");
  });

  it("tries a lower quality when a successful response has no playable URL", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const resolution = Number(url.searchParams.get("resolution"));
      const body = resolution === 1080
        ? { success: true, message: "Stream is not available at this quality." }
        : { url: "https://media.example/lower.mp4", resolution };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const source = await loadPlaybackSource({ subjectId: "film-1", contentType: "MOVIE", resolution: 1080 });

    expect(source.url).toBe("https://media.example/lower.mp4");
    expect(source.resolution).toBe(720);
    expect(source.requestedResolution).toBe(720);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tries a lower quality after an API-declared failure with HTTP 200", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const resolution = Number(url.searchParams.get("resolution"));
      const body = resolution === 1080
        ? { success: false, error: "No stream at this quality." }
        : { url: "https://media.example/fallback.mp4", selected_quality: "720p" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const source = await loadPlaybackSource({ subjectId: "film-2", contentType: "MOVIE", resolution: 1080 });

    expect(source.resolution).toBe(720);
    expect(source.requestedResolution).toBe(720);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not infer actual provider resolution from the requested quality", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ url: "https://media.example/unlabeled.mp4" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const source = await loadPlaybackSource({ subjectId: "film-3", contentType: "MOVIE", resolution: 1080 });

    expect(source.resolution).toBeUndefined();
    expect(source.requestedResolution).toBe(1080);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
