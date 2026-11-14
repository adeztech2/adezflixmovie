import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, CalendarDays, Captions, Clapperboard, Clock3, Play, Star, Volume2 } from "lucide-react";
import { apiGet, castNames, directorNames, displayType, extractMedia, extractPrimary, findNestedArrays, isRecord, normalizeMedia, posterFrom, type MediaItem } from "@/lib/adezflix-api";
import { getPlaybackKind } from "@/lib/playback";
import { StateMessage, MediaCard, SectionHeading } from "@/components/flix/FlixChrome";
import { isInMyList, toggleMyList } from "@/lib/user-state";

type EpisodeChoice = { title: string; number: number; id?: string; description?: string; poster?: string };
type SeasonChoice = { number: number; label: string; episodes: EpisodeChoice[]; episodeCount?: number };
type DetailsPayload = { details: unknown; seasons: unknown };

function readField(value: unknown, keys: string[]): unknown {
  if (!isRecord(value)) return undefined;
  for (const key of keys) if (value[key] !== undefined && value[key] !== null) return value[key];
  return undefined;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildSeasons(value: unknown): SeasonChoice[] {
  const arrays = findNestedArrays(value, ["seasons", "season_list", "seasonList"]);
  const seasonObjects = arrays.flatMap((array) => Array.isArray(array) ? array.filter(isRecord) : []);
  const seasons = seasonObjects.map((season, index) => {
    const seasonNumber = numberValue(readField(season, ["season", "season_number", "seasonNumber", "number", "index"]), index + 1);
    const episodeArrays = findNestedArrays(season, ["episodes", "episode_list", "episodeList", "items"]);
    const parsedEpisodes = episodeArrays.flatMap((list) => Array.isArray(list) ? list.filter(isRecord) : []).map((episode, episodeIndex) => ({
      title: String(readField(episode, ["title", "name", "episode_title", "episodeName"]) || `Episode ${numberValue(readField(episode, ["episode", "episode_number", "episodeNumber", "number", "index"]), episodeIndex + 1)}`),
      number: numberValue(readField(episode, ["episode", "episode_number", "episodeNumber", "number", "index"]), episodeIndex + 1),
      id: String(readField(episode, ["subject_id", "subjectId", "id"]) || "") || undefined,
      description: String(readField(episode, ["description", "synopsis", "introduction", "overview"]) || "") || undefined,
      poster: posterFrom(episode),
    }));
    const available = String(readField(season, ["available_episodes", "availableEpisodes"]) || "").split(",").map((entry) => Number(entry.trim())).filter((entry) => Number.isInteger(entry) && entry > 0);
    const maxEpisodes = numberValue(readField(season, ["max_episodes", "maxEpisodes", "episode_count"]), 0);
    const fallbackNumbers = available;
    const episodes = parsedEpisodes.length ? parsedEpisodes : fallbackNumbers.map((number) => ({ title: `Episode ${number}`, number }));
    return { number: seasonNumber, label: String(readField(season, ["title", "name"]) || `Season ${seasonNumber}`), episodes, episodeCount: maxEpisodes || undefined };
  }).filter((season) => season.episodes.length > 0 || Boolean(season.episodeCount));
  const byNumber = new Map<number, SeasonChoice>();
  seasons.forEach((season) => byNumber.set(season.number, season));
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

function fallbackSeasonPayload(value: unknown): unknown {
  const item = extractPrimary(value) || (isRecord(value) ? value : undefined);
  if (!item) return null;
  const rawSeasonNumbers = readField(item, ["season_numbers", "seasonNumbers"]);
  let seasonNumbers = (Array.isArray(rawSeasonNumbers) ? rawSeasonNumbers : String(rawSeasonNumbers ?? "").split(","))
    .map((entry) => Number(entry))
    .filter((number) => Number.isInteger(number) && number > 0);
  const rawDetectors = readField(item, ["resource_detectors", "resourceDetectors"]);
  const detectors = Array.isArray(rawDetectors) ? rawDetectors.filter(isRecord) : [];
  if (seasonNumbers.length === 1 && seasonNumbers[0] > 1 && detectors.length >= seasonNumbers[0]) {
    seasonNumbers = Array.from({ length: seasonNumbers[0] }, (_, index) => index + 1);
  }
  if (!seasonNumbers.length) {
    seasonNumbers = [...new Set(detectors.map((detector) => numberValue(readField(detector, ["season", "season_number", "seasonNumber"]), 0)).filter((number) => number > 0))];
  }
  if (!seasonNumbers.length && detectors.length) seasonNumbers = [1];

  const seasons: Array<{ season: number; episode_count: number; episodes: Array<{ episode: number; title: string }> }> = [];
  seasonNumbers.forEach((season, index) => {
    const detector = detectors.find((entry) => Number(readField(entry, ["season", "season_number", "seasonNumber"])) === season)
      || detectors[index]
      || (seasonNumbers.length === 1 ? detectors[0] : undefined);
    if (!detector) return;
    const count = numberValue(readField(detector, ["total_episode", "totalEpisodes", "episode_count", "max_episodes"]), 0);
    const rawAvailable = readField(detector, ["available_episodes", "availableEpisodes"]);
    const available = (Array.isArray(rawAvailable) ? rawAvailable : String(rawAvailable ?? "").split(","))
      .map((entry) => Number(entry))
      .filter((episode) => Number.isInteger(episode) && episode > 0);
    const episodeNumbers = available.length ? available : Array.from({ length: Math.min(count, 200) }, (_, episodeIndex) => episodeIndex + 1);
    if (!episodeNumbers.length) return;
    seasons.push({
      season,
      episode_count: count || episodeNumbers.length,
      episodes: episodeNumbers.map((episode) => ({ episode, title: `Episode ${episode}` })),
    });
  });
  return seasons.length ? { seasons } : null;
}

function nextEpisodeAt(seasons: SeasonChoice[], seasonIndex: number, episodeIndex: number): { season: number; episode: number } | undefined {
  const currentSeason = seasons[seasonIndex];
  const nextInSeason = currentSeason?.episodes[episodeIndex + 1];
  if (nextInSeason && currentSeason) return { season: currentSeason.number, episode: nextInSeason.number };
  const nextSeason = seasons[seasonIndex + 1];
  return nextSeason?.episodes[0] ? { season: nextSeason.number, episode: nextSeason.episodes[0].number } : undefined;
}

function watchHref(item: MediaItem, season?: number, episode?: number, next?: { season: number; episode: number }, afterNext?: { season: number; episode: number }): string {
  const query = new URLSearchParams({ type: item.type || "MOVIE", title: item.title });
  if (season) query.set("season", String(season));
  if (episode) query.set("episode", String(episode));
  if (next) { query.set("nextSeason", String(next.season)); query.set("nextEpisode", String(next.episode)); }
  if (afterNext) { query.set("nextNextSeason", String(afterNext.season)); query.set("nextNextEpisode", String(afterNext.episode)); }
  return `/watch/${encodeURIComponent(item.id)}?${query}`;
}

export default function TitleDetails() {
  const [, params] = useRoute("/title/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const routeType = new URLSearchParams(window.location.search).get("type") || "";
  const [payload, setPayload] = useState<DetailsPayload | null>(null);
  const [cast, setCast] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [posterBroken, setPosterBroken] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPayload(null);
    setRecommendations([]);
    setSaved(isInMyList(id));
    const optional = (path: string) => apiGet<unknown>(path, controller.signal).catch(() => null);
    const typeName = routeType ? displayType(routeType) : "";
    const detailsPath = typeName === "Series"
      ? `/tv/info/${encodeURIComponent(id)}`
      : typeName === "Movie"
        ? `/movie/info/${encodeURIComponent(id)}`
        : `/item/${encodeURIComponent(id)}`;
    const detailsRequest = apiGet<unknown>(detailsPath, controller.signal).catch((cause: unknown) => {
      if (controller.signal.aborted || (typeName !== "Series" && typeName !== "Movie")) throw cause;
      return apiGet<unknown>(`/item/${encodeURIComponent(id)}`, controller.signal);
    });
    Promise.all([
      detailsRequest,
      optional(`/item/${encodeURIComponent(id)}/cast`),
      optional(`/item/${encodeURIComponent(id)}/seasons`),
    ]).then(([details, castPayload, seasonPayload]) => {
      const routeHasEpisodeDetails = Boolean(seasonPayload && buildSeasons(seasonPayload).some((season) => season.episodes.length > 0));
      const usableSeasonPayload = routeHasEpisodeDetails ? seasonPayload : fallbackSeasonPayload(details) ?? seasonPayload;
      setPayload({ details, seasons: usableSeasonPayload });
      setCast(castNames(castPayload));
    }).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "This title couldn't be loaded.");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [id, routeType, attempt]);

  const item = useMemo<MediaItem | null>(() => {
    if (!payload) return null;
    const source = extractPrimary(payload.details) || (isRecord(payload.details) ? payload.details : undefined);
    if (!source) return null;
    const normalized = normalizeMedia({ ...source, subject_id: source.subject_id || id });
    if (!normalized) return null;
    const poster = posterFrom(source) || normalized.poster;
    const coverValue = readField(source, ["backdrop_url", "cover_url", "landscape_url"]);
    return { ...normalized, poster, cover: typeof coverValue === "string" ? coverValue : normalized.cover };
  }, [payload, id]);
  useEffect(() => setPosterBroken(false), [item?.poster]);
  const seasons = useMemo(() => buildSeasons(payload?.seasons), [payload?.seasons]);
  const currentSeasonIndex = Math.max(0, seasons.findIndex((season) => season.number === selectedSeason));
  const currentSeason = seasons[currentSeasonIndex] || seasons[0];
  const episodic = displayType(item?.type) === "Series" || displayType(item?.type) === "Anime" || seasons.length > 0;
  const directors = directorNames(payload?.details);
  const synopsis = item?.synopsis || String(readField(item?.source, ["introduction", "overview", "storyline"]) || "The catalog has not provided a synopsis for this title.");

  useEffect(() => {
    if (!item) return;
    document.title = `${item.title} — ADEZ FLIX`;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = item.synopsis || `View catalog details for ${item.title} on ADEZ FLIX.`;
    const controller = new AbortController();
    const endpoint = displayType(item.type) === "Series" ? `/tv/recommend/${encodeURIComponent(item.id)}?limit=12` : `/movie/recommend/${encodeURIComponent(item.id)}?limit=12`;
    apiGet<unknown>(endpoint, controller.signal).then((result) => setRecommendations(extractMedia(result).filter((candidate) => candidate.id !== item.id))).catch(() => setRecommendations([]));
    return () => controller.abort();
  }, [item?.id, item?.type]);

  const handleSave = () => { if (!item) return; setSaved(toggleMyList(item)); };

  if (loading) return <main className="page-shell content-wrap"><div className="details-skeleton"><div /><section><div /><div /><div /><div /></section></div></main>;
  if (error) return <main className="page-shell content-wrap"><StateMessage kind="error" title="Title details are unavailable" message={error} retry={() => setAttempt((value) => value + 1)} /></main>;
  if (!item || !payload) return <main className="page-shell content-wrap"><StateMessage title="We couldn't find this title" message="It may have moved in the catalog. Head back and choose another title." retry={() => navigate("/")} /></main>;

  const selectedEpisodeIndex = currentSeason?.episodes.length ? 0 : -1;
  const firstEpisode = currentSeason?.episodes[selectedEpisodeIndex];
  const firstNext = selectedEpisodeIndex >= 0 ? nextEpisodeAt(seasons, currentSeasonIndex, selectedEpisodeIndex) : undefined;
  const firstAfterNext = firstNext ? (() => {
    const seasonIndex = seasons.findIndex((season) => season.number === firstNext.season);
    const episodeIndex = seasons[seasonIndex]?.episodes.findIndex((entry) => entry.number === firstNext.episode) ?? -1;
    return nextEpisodeAt(seasons, seasonIndex, episodeIndex);
  })() : undefined;
  const hasPlaybackRoute = Boolean(getPlaybackKind(item.type));

  return (
    <main className="page-shell details-page">
      <section className="details-hero" style={{ backgroundImage: `url("${item.cover || item.poster || ""}")` }}>
        <div className="details-shade" />
        <div className="details-hero-inner content-wrap">
          <Link href="/" className="back-link"><ArrowLeft size={16} /> Back to discover</Link>
          <div className="details-main">
            <div className="details-poster">{item.poster && !posterBroken ? <img src={item.poster} alt={`${item.title} poster`} onError={() => setPosterBroken(true)} /> : <div className="poster-fallback"><Clapperboard size={34} /><span>Artwork unavailable</span></div>}</div>
            <div className="details-copy">
              <span className="eyebrow-pill">{displayType(item.type).toUpperCase()}</span>
              <h1>{item.title}</h1>
              {item.originalTitle && item.originalTitle !== item.title && <p className="original-title">{item.originalTitle}</p>}
              <div className="details-facts">
                {item.year && <span><CalendarDays size={15} /> {item.year}</span>}
                {item.duration && <span><Clock3 size={15} /> {item.duration}</span>}
                {item.rating && <span className="rating"><Star size={15} fill="currentColor" /> {item.rating}</span>}
                {item.country && <span>{item.country}</span>}
              </div>
              {item.genres.length > 0 && <div className="genre-list">{item.genres.map((genre) => <span key={genre}>{genre}</span>)}</div>}
              <p className="details-synopsis">{synopsis}</p>
              <div className="details-actions">
                {!hasPlaybackRoute && <button type="button" className="button button--primary" disabled><Clapperboard size={15} /> Player unavailable</button>}
                {hasPlaybackRoute && !episodic && <Link href={watchHref(item)} className="button button--primary"><Play size={16} fill="currentColor" /> Play now</Link>}
                {hasPlaybackRoute && episodic && firstEpisode && <Link href={watchHref(item, currentSeason.number, firstEpisode.number, firstNext, firstAfterNext)} className="button button--primary"><Play size={16} fill="currentColor" /> Play first episode</Link>}
                {hasPlaybackRoute && episodic && !firstEpisode && <button type="button" className="button button--primary" disabled><Clapperboard size={15} /> Episode list unavailable</button>}
                <button type="button" className="button button--outline" onClick={handleSave}>{saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{saved ? "In My List" : "Add to My List"}</button>
              </div>
              {!hasPlaybackRoute && <div className="rights-panel"><Clapperboard size={16} /><span>The provider does not document a playback route for this catalog category. You can still browse and save the title.</span></div>}
              <div className="availability-note">Playback is free to access through the catalog API; stream availability and supported formats vary by title.</div>
              {cast.length > 0 && <div className="cast-line"><span>CAST</span><p>{cast.join(" · ")}</p></div>}
            </div>
          </div>
        </div>
      </section>

      <section className="content-wrap details-extra" aria-label="Provider metadata">
        <div className="metadata-block"><h2><Volume2 size={16} /> Audio languages</h2><p>Original audio and dubbed versions appear in the player when supplied by the API.</p></div>
        <div className="metadata-block"><h2><Captions size={16} /> Subtitles</h2><p>Available caption tracks can be loaded and selected in the player.</p></div>
        <div className="metadata-block"><h2>Available resolutions</h2><p>Choose a quality in the player; the available options depend on the returned stream.</p></div>
        <div className="metadata-block"><h2>Director</h2>{directors.length ? <p>{directors.join(" · ")}</p> : <p>The catalog did not supply director information.</p>}</div>
      </section>

      {episodic && <section className="content-wrap episodes-section" id="episodes">
        <div className="episodes-heading"><div><span className="section-eyebrow">CONTINUE THE STORY</span><h2>Episodes</h2></div>
          {seasons.length > 1 && <label className="season-picker">Season <select value={currentSeason?.number || selectedSeason} onChange={(event) => setSelectedSeason(Number(event.target.value))}>{seasons.map((season) => <option key={season.number} value={season.number}>{season.label}</option>)}</select></label>}
        </div>
        {currentSeason?.episodes.length ? <div className="episode-list">{currentSeason.episodes.map((episode, index) => {
          const next = nextEpisodeAt(seasons, currentSeasonIndex, index);
          const afterNext = next ? (() => { const nextSeasonIndex = seasons.findIndex((season) => season.number === next.season); const nextEpisodeIndex = seasons[nextSeasonIndex]?.episodes.findIndex((entry) => entry.number === next.episode) ?? -1; return nextEpisodeAt(seasons, nextSeasonIndex, nextEpisodeIndex); })() : undefined;
          const label = <>{episode.poster && <img className="episode-thumb" src={episode.poster} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />}<span className="episode-number">{String(episode.number).padStart(2, "0")}</span><span className="episode-copy"><strong>{episode.title}</strong><small>{currentSeason.label}</small>{episode.description && <small className="episode-description">{episode.description}</small>}</span>{hasPlaybackRoute ? <span className="episode-play"><Play size={16} fill="currentColor" /></span> : <span className="episode-lock">Unavailable</span>}</>;
          return hasPlaybackRoute ? <Link key={`${currentSeason.number}-${episode.number}`} href={watchHref(item, currentSeason.number, episode.number, next, afterNext)} className="episode-card">{label}</Link> : <div key={`${currentSeason.number}-${episode.number}`} className="episode-card episode-card--locked" aria-disabled="true">{label}</div>;
        })}</div> : currentSeason?.episodeCount ? <StateMessage title="Episode details not supplied" message={`The provider reports up to ${currentSeason.episodeCount} episodes for this season, but did not return episode titles, descriptions, or thumbnails.`} /> : <StateMessage title="Episode list unavailable" message="The API did not provide episode information for this title." />}
      </section>}

      {recommendations.length > 0 && <section className="content-wrap similar-section"><SectionHeading eyebrow="MORE LIKE THIS" title="Similar titles" /><div className="media-rail">{recommendations.map((candidate) => <MediaCard key={candidate.id} item={candidate} />)}</div></section>}
      <section className="content-wrap details-bottom"><span>Ready for another story?</span><Link href="/search" className="text-link">Explore the catalog <ArrowRight size={15} /></Link></section>
    </main>
  );
}
