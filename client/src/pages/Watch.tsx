import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, Captions, ChevronRight, LoaderCircle, RefreshCw, Volume2 } from "lucide-react";
import {
  apiGet,
  extractAudioLanguages,
  type AudioLanguage,
  type CaptionTrack,
  type MediaItem,
} from "@/lib/adezflix-api";
import {
  defaultResolution,
  fetchCaptionText,
  getPlaybackKind,
  loadCaptionTracks,
  loadPlaybackSource,
  subtitleToVtt,
  type PlaybackRequest,
} from "@/lib/playback";
import { saveWatchProgress } from "@/lib/user-state";

type PreparedCaption = { id: string; label: string; language: string; url: string };
const QUALITY_OPTIONS = [1080, 720, 480, 360];

export default function Watch() {
  const [, params] = useRoute("/watch/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const query = new URLSearchParams(window.location.search);
  const contentType = query.get("type") || "MOVIE";
  const title = query.get("title") || "ADEZ FLIX Player";
  const season = Number(query.get("season") || 0);
  const episode = Number(query.get("episode") || 0);
  const startSeconds = Number(query.get("start") || 0);
  const nextSeason = Number(query.get("nextSeason") || 0);
  const nextEpisode = Number(query.get("nextEpisode") || 0);
  const nextNextSeason = Number(query.get("nextNextSeason") || 0);
  const nextNextEpisode = Number(query.get("nextNextEpisode") || 0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Connecting to the provider stream.");
  const [streamUrl, setStreamUrl] = useState("");
  const [actualResolution, setActualResolution] = useState(0);
  const [availableResolutions, setAvailableResolutions] = useState<number[]>(QUALITY_OPTIONS);
  const [quality, setQuality] = useState(() => defaultResolution(contentType));
  const [dubs, setDubs] = useState<AudioLanguage[]>([]);
  const [audioSubjectId, setAudioSubjectId] = useState("");
  const [rawCaptions, setRawCaptions] = useState<CaptionTrack[]>([]);
  const [preparedCaptions, setPreparedCaptions] = useState<PreparedCaption[]>([]);
  const [captionState, setCaptionState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [selectedCaption, setSelectedCaption] = useState("off");
  const [attempt, setAttempt] = useState(0);
  const [resumeAt, setResumeAt] = useState(startSeconds);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSavedAt = useRef(0);
  const startAppliedKey = useRef("");
  const playbackKind = getPlaybackKind(contentType);
  const playerKey = `${id}:${season}:${episode}:${quality}:${audioSubjectId}`;
  const progressItem: MediaItem = { id, title, type: contentType, genres: [], source: {} };
  const episodeLabel = season > 0 && episode > 0
    ? `Season ${season} · Episode ${episode}`
    : playbackKind === "live" ? "Live title" : "Feature presentation";
  const detailHref = playbackKind === "live"
    ? "/live-tv"
    : `/title/${encodeURIComponent(id)}?${new URLSearchParams({ type: contentType, title })}`;

  const nextHref = nextSeason > 0 && nextEpisode > 0
    ? (() => {
        const nextQuery = new URLSearchParams({ type: contentType, title, season: String(nextSeason), episode: String(nextEpisode) });
        if (nextNextSeason > 0 && nextNextEpisode > 0) {
          nextQuery.set("nextSeason", String(nextNextSeason));
          nextQuery.set("nextEpisode", String(nextNextEpisode));
        }
        return `/watch/${encodeURIComponent(id)}?${nextQuery}`;
      })()
    : "";

  useEffect(() => {
    setQuality(defaultResolution(contentType));
    setAudioSubjectId("");
    setDubs([]);
  }, [contentType, id]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    apiGet<unknown>(`/item/${encodeURIComponent(id)}/dubs`, controller.signal)
      .then((payload) => setDubs(extractAudioLanguages(payload).filter((entry) => Boolean(entry.subjectId) && !entry.original && !/^original$/i.test(entry.label))))
      .catch(() => { if (!controller.signal.aborted) setDubs([]); });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (!id) {
      setStatus("error");
      setMessage("Choose a title from the catalog before opening the player.");
      return;
    }
    if (!playbackKind) {
      setStatus("error");
      setMessage("This catalog category does not have a documented playback endpoint.");
      return;
    }

    const controller = new AbortController();
    const request: PlaybackRequest = {
      subjectId: audioSubjectId || id,
      contentType,
      ...(season > 0 ? { season } : {}),
      ...(episode > 0 ? { episode } : {}),
      resolution: quality,
    };
    setStatus("loading");
    setMessage("Connecting to the provider stream.");
    setStreamUrl("");
    setActualResolution(0);
    setRawCaptions([]);
    setPreparedCaptions([]);
    setSelectedCaption("off");
    setCaptionState("loading");

    void loadPlaybackSource(request, controller.signal).then((source) => {
      if (controller.signal.aborted) return;
      setStreamUrl(source.url);
      setActualResolution(source.resolution ?? 0);
      setAvailableResolutions(source.availableResolutions.length ? source.availableResolutions : QUALITY_OPTIONS);
      setStatus("ready");
      setMessage("");
      const selectedQuality = source.resolution ?? source.requestedResolution;
      if (selectedQuality !== quality) setQuality(selectedQuality);
      const captionRequest = { ...request, resolution: selectedQuality };
      void loadCaptionTracks(captionRequest, source.payload, controller.signal)
        .then((tracks) => {
          if (controller.signal.aborted) return;
          setRawCaptions(tracks.slice(0, 8));
          setCaptionState(tracks.length ? "loading" : "empty");
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setRawCaptions([]);
          setCaptionState("error");
        });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setMessage(error instanceof Error ? error.message : "The provider stream is unavailable.");
      setStatus("error");
    });

    return () => controller.abort();
  }, [id, contentType, season, episode, quality, audioSubjectId, attempt, playbackKind]);

  useEffect(() => {
    if (!rawCaptions.length) {
      if (captionState !== "error") setCaptionState("empty");
      setPreparedCaptions([]);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const objectUrls: string[] = [];
    setCaptionState("loading");
    void Promise.all(rawCaptions.map(async (track, index) => {
      try {
        const text = await fetchCaptionText(track, controller.signal);
        const vtt = subtitleToVtt(text);
        const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt;charset=utf-8" }));
        objectUrls.push(url);
        return { id: `${index}:${track.language}`, label: track.label, language: track.language, url };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return null;
      }
    })).then((tracks) => {
      if (!active) return;
      const usable = tracks.filter((track): track is PreparedCaption => track !== null);
      setPreparedCaptions(usable);
      setCaptionState(usable.length ? "ready" : "error");
    }).catch(() => {
      if (!active) return;
      setPreparedCaptions([]);
      setCaptionState("error");
    });
    return () => {
      active = false;
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [rawCaptions]);

  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    for (let index = 0; index < tracks.length; index += 1) {
      const caption = preparedCaptions[index];
      tracks[index].mode = caption?.id === selectedCaption ? "showing" : "disabled";
    }
  }, [preparedCaptions, selectedCaption, streamUrl]);

  const saveProgress = (force = false) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || !Number.isFinite(video.currentTime)) return;
    if (!force && video.currentTime - lastSavedAt.current < 10) return;
    saveWatchProgress({
      item: progressItem,
      position: video.currentTime,
      duration: video.duration,
      ...(season > 0 ? { season } : {}),
      ...(episode > 0 ? { episode } : {}),
    });
    lastSavedAt.current = video.currentTime;
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (startAppliedKey.current !== playerKey) {
      const target = Math.max(0, Math.min(resumeAt, Math.max(0, video.duration - 1)));
      if (target > 0) video.currentTime = target;
      startAppliedKey.current = playerKey;
    }
  };

  const changeQuality = (nextQuality: number) => {
    if (videoRef.current && Number.isFinite(videoRef.current.currentTime)) setResumeAt(videoRef.current.currentTime);
    setQuality(nextQuality);
  };

  const handleEnded = () => {
    saveProgress(true);
    if (nextHref) navigate(nextHref);
  };

  if (!id) {
    return <main className="page-shell content-wrap"><div className="player-error"><h1>No title selected</h1><p>{message}</p><Link className="button button--outline" href="/">Back to ADEZ FLIX</Link></div></main>;
  }

  return (
    <main className="page-shell watch-page content-wrap">
      <div className="watch-topline">
        <Link href={detailHref} className="back-link"><ArrowLeft size={16} /> {playbackKind === "live" ? "Back to Live TV" : "Back to details"}</Link>
        <span className="watch-breadcrumb">{title} <i>/</i> {episodeLabel}</span>
      </div>
      <div className="player-frame">
        {status === "loading" && <div className="player-error"><LoaderCircle className="animate-spin" size={29} /><h2>Finding a playable stream</h2><p>Connecting to the documented provider endpoint. No sign-in is required.</p></div>}
        {status === "error" && <div className="player-error"><h2>Stream unavailable</h2><p>{message}</p><button className="button button--outline" type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={15} /> Retry stream</button></div>}
        {status === "ready" && streamUrl && <video
          key={streamUrl}
          ref={videoRef}
          className="flix-video"
          src={streamUrl}
          controls
          playsInline
          preload="metadata"
          aria-label={`Playback for ${title}`}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={() => saveProgress(false)}
          onPause={() => saveProgress(true)}
          onEnded={handleEnded}
          onError={() => { setMessage("The provider returned a source, but this browser could not play its format. Try another quality or title."); setStatus("error"); }}
        >
          {preparedCaptions.map((track) => <track key={track.id} kind="captions" src={track.url} srcLang={track.language} label={track.label} />)}
        </video>}
        <div className="player-corner-mark"><span>ADEZ</span> FLIX</div>
      </div>
      <div className="player-controls-row">
        <div className="player-title">
          <span className="section-eyebrow">FREE CATALOG · NO SIGN-IN</span>
          <h1>{title}</h1>
          <p>{episodeLabel}{actualResolution > 0 ? ` · Provider stream ${actualResolution}p` : status === "ready" ? ` · Provider did not report actual quality (request ${quality}p)` : ""}</p>
          <p className={`caption-hint${captionState === "error" ? " caption-hint--error" : ""}`}><Captions size={14} />{captionState === "loading" ? "Loading available subtitles…" : captionState === "ready" ? `${preparedCaptions.length} subtitle track${preparedCaptions.length === 1 ? "" : "s"} available` : captionState === "error" ? "Subtitle files could not be loaded; the video is still available." : "No subtitles are available for this stream."}</p>
        </div>
        <div className="player-settings">
          <label><span>Quality</span><select aria-label="Video quality" value={quality} onChange={(event) => changeQuality(Number(event.target.value))}>{[...new Set([...availableResolutions, quality])].sort((a, b) => b - a).map((value) => <option key={value} value={value}>{value}p</option>)}</select></label>
          {dubs.length > 0 && <label><Volume2 size={14} /><span>Audio</span><select aria-label="Audio language" value={audioSubjectId} onChange={(event) => setAudioSubjectId(event.target.value)}><option value="">Original</option>{dubs.map((dub, index) => <option key={`${dub.subjectId}-${index}`} value={dub.subjectId}>{dub.label}</option>)}</select></label>}
          <label><Captions size={14} /><span>Subtitles</span><select aria-label="Subtitle language" value={selectedCaption} onChange={(event) => setSelectedCaption(event.target.value)} disabled={!preparedCaptions.length}><option value="off">Off</option>{preparedCaptions.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}</select></label>
          {nextHref && <Link href={nextHref} className="button button--outline">Next episode <ChevronRight size={15} /></Link>}
        </div>
      </div>
      <section className="player-note"><span className="player-note-icon"><Captions size={19} /></span><p>Playback and subtitles are supplied by the catalog API; availability and quality vary by title. ADEZ FLIX is free to browse and does not require sign-in. Download links are not enabled.</p></section>
    </main>
  );
}
