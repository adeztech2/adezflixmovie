import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BookmarkPlus, CirclePlay, Search, Sparkles } from "lucide-react";
import { apiGet, displayType, extractMedia, extractSections, type CatalogSection, type MediaItem } from "@/lib/adezflix-api";
import { getContinueWatching, getMyList, getWatchHistory, subscribeLocalLibrary, type WatchProgress } from "@/lib/user-state";
import { LoadingCards, MediaCard, SectionHeading, StateMessage } from "@/components/flix/FlixChrome";

type HomeData = {
  sections: CatalogSection[];
  trendingMovies: MediaItem[];
  popularMovies: MediaItem[];
  newMovies: MediaItem[];
  topMovies: MediaItem[];
  popularTv: MediaItem[];
  newTv: MediaItem[];
  trendingTv: MediaItem[];
};

async function safeMedia(path: string, signal?: AbortSignal): Promise<MediaItem[]> {
  try { return extractMedia(await apiGet<unknown>(path, signal)); }
  catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; return []; }
}

async function loadHome(signal?: AbortSignal): Promise<HomeData> {
  const [home, popularMovies, newMovies, topMovies, popularTv, newTv, trendingTv] = await Promise.all([
    apiGet<unknown>("/homepage?tab=0&page=1&mode=clean&include_aux=true", signal).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return {};
    }),
    safeMedia("/movie/popular?page=1", signal),
    safeMedia("/movie/new?page=1&per_page=20", signal),
    safeMedia("/movie/top?page=1&per_page=20", signal),
    safeMedia("/tv/popular?page=1", signal),
    safeMedia("/tv/new?page=1&per_page=20", signal),
    safeMedia("/tv/trending?page=1&per_page=20", signal),
  ]);
  const root = (home && typeof home === "object" ? home : {}) as Record<string, unknown>;
  const auxiliary = root.auxiliary && typeof root.auxiliary === "object" ? root.auxiliary as Record<string, unknown> : {};
  const trendingMovies = extractMedia(root.trending ?? auxiliary.trending);
  const sections = extractSections(home);
  return { sections, trendingMovies, popularMovies, newMovies, topMovies, popularTv, newTv, trendingTv };
}

function ContinueCard({ entry }: { entry: WatchProgress }) {
  const item = entry.item;
  const percent = Math.min(100, Math.max(0, (entry.position / entry.duration) * 100));
  const params = new URLSearchParams({ type: item.type || "MOVIE", title: item.title, start: String(Math.floor(entry.position)) });
  if (entry.season) params.set("season", String(entry.season));
  if (entry.episode) params.set("episode", String(entry.episode));
  return (
    <Link href={`/watch/${encodeURIComponent(item.id)}?${params}`} className="media-card continue-card">
      <div className="media-art">{item.poster ? <img src={item.poster} alt={`${item.title} poster`} loading="lazy" /> : <div className="poster-fallback"><CirclePlay size={28} /><span>Artwork unavailable</span></div>}<span className="progress-track"><i style={{ width: `${percent}%` }} /></span></div>
      <div className="media-card-info"><h3>{item.title}</h3><div className="media-meta"><span>{entry.season ? `S${entry.season} · E${entry.episode || 1}` : `${Math.round(percent)}% watched`}</span></div></div>
    </Link>
  );
}

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [, refreshLibrary] = useState(0);

  useEffect(() => subscribeLocalLibrary(() => refreshLibrary((value) => value + 1)), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadHome(controller.signal).then(setData).catch((cause: unknown) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "The catalog is unavailable right now.");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [attempt]);

  const allItems = useMemo(() => {
    if (!data) return [];
    const deduped = new Map<string, MediaItem>();
    [...data.trendingMovies, ...data.popularMovies, ...data.newMovies, ...data.topMovies, ...data.popularTv, ...data.newTv, ...data.trendingTv, ...data.sections.flatMap((section) => section.items)].forEach((item) => deduped.set(item.id, item));
    return [...deduped.values()];
  }, [data]);
  const featured = data?.trendingMovies[0] || data?.popularMovies[0] || data?.sections[0]?.items[0] || allItems[0];
  const continueWatching = getContinueWatching();
  const library = getMyList();
  const history = getWatchHistory();
  const seed = history[0]?.item || library[0];

  useEffect(() => {
    if (!seed) { setRecommendations([]); return; }
    const controller = new AbortController();
    const path = displayType(seed.type) === "Series" ? `/tv/recommend/${encodeURIComponent(seed.id)}?limit=12` : `/movie/recommend/${encodeURIComponent(seed.id)}?limit=12`;
    apiGet<unknown>(path, controller.signal).then((payload) => setRecommendations(extractMedia(payload).filter((item) => item.id !== seed.id))).catch(() => setRecommendations([]));
    return () => controller.abort();
  }, [seed?.id, seed?.type]);

  const rows = useMemo(() => {
    if (!data) return [];
    const candidates: CatalogSection[] = [
      { title: "Trending Movies", items: data.trendingMovies },
      { title: "Popular Movies", items: data.popularMovies },
      { title: "Latest Releases", items: data.newMovies },
      { title: "Top Rated Movies", items: data.topMovies },
      { title: "Popular TV Series", items: data.popularTv },
      { title: "New TV Shows", items: data.newTv },
      { title: "Trending TV Series", items: data.trendingTv },
      ...(recommendations.length ? [{ title: "Recommended For You", items: recommendations }] : []),
      ...data.sections,
    ];
    return candidates.filter((section) => section.items.length > 0).map((section) => ({ ...section, items: [...new Map(section.items.map((item) => [item.id, item])).values()] }));
  }, [data, recommendations]);

  useEffect(() => {
    document.title = "ADEZ FLIX — Your Entertainment. Your World.";
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = "Browse movies, TV series, live events, and more on ADEZ FLIX.";
  }, []);

  return (
    <main className="page-shell">
      <section className="hero-stage">
        {featured?.cover || featured?.poster ? <div className="hero-backdrop" style={{ backgroundImage: `url("${featured.cover || featured.poster}")` }} /> : <div className="hero-backdrop hero-backdrop--gradient" />}
        <div className="hero-vignette" />
        <div className="hero-content">
          <span className="eyebrow-pill"><Sparkles size={13} /> ADEZ FLIX ORIGINAL DISCOVERY</span>
          <p className="hero-overline">YOUR ENTERTAINMENT. YOUR WORLD.</p>
          <h1 className={featured ? "hero-title--featured" : undefined}>{featured ? featured.title : <>Your Entertainment.<br /><em>Your World.</em></>}</h1>
          <p className="hero-copy">{featured?.synopsis || "Explore movies, TV, anime, and live titles in one cinematic catalog."}</p>
          {featured ? <div className="hero-featured">
            <Link href={`/title/${encodeURIComponent(featured.id)}?${new URLSearchParams({ type: featured.type || "MOVIE", title: featured.title })}`} className="button button--primary">More Info <ArrowRight size={16} /></Link>
            <Link href={`/watch/${encodeURIComponent(featured.id)}?${new URLSearchParams({ type: featured.type || "MOVIE", title: featured.title })}`} className="button button--outline"><CirclePlay size={17} /> Play now</Link>
            {featured.year && <span className="hero-year">{featured.year}</span>}
            {featured.rating && <span className="hero-rating">★ {featured.rating}</span>}
            {featured.genres.length > 0 && <span className="hero-year">{featured.genres.slice(0, 2).join(" · ")}</span>}
          </div> : !loading && !error ? <Link href="/search" className="button button--primary"><Search size={16} /> Explore titles</Link> : null}
          <div className="hero-index"><span>01</span><i /><span>YOUR ENTERTAINMENT. YOUR WORLD.</span></div>
        </div>
        <div className="hero-side-note"><span>THE ADEZ FLIX EDIT</span><b>Powered by real catalog data</b></div>
      </section>

      <section className="browse-strip" aria-label="Browse categories">
        <div className="browse-label">Explore ADEZ FLIX</div>
        <div className="browse-links">
          <Link href="/search?type=ALL">Everything <ArrowRight size={14} /></Link>
          <Link href="/movies">Movies <ArrowRight size={14} /></Link>
          <Link href="/tv-shows">TV Shows <ArrowRight size={14} /></Link>
          <Link href="/live-tv">Live TV <ArrowRight size={14} /></Link>
          <Link href="/search?type=ANIME">Anime <ArrowRight size={14} /></Link>
          <Link href="/search?type=MUSIC">Music <ArrowRight size={14} /></Link>
          <Link href="/search?type=EDUCATION">Education <ArrowRight size={14} /></Link>
          <Link href="/search?type=SHORT_TV">Short TV <ArrowRight size={14} /></Link>
          <Link href="/search?type=SPORTS">Sports <ArrowRight size={14} /></Link>
          <Link href="/search?type=KIDS">Kids <ArrowRight size={14} /></Link>
          <Link href="/search?type=ASIAN">Asian cinema <ArrowRight size={14} /></Link>
          <Link href="/search?type=WESTERN">Western cinema <ArrowRight size={14} /></Link>
          <Link href="/search?type=NOLLYWOOD">Nollywood <ArrowRight size={14} /></Link>
        </div>
      </section>

      {error && <div className="content-wrap"><StateMessage kind="error" title="We couldn't load the catalog" message={error} retry={() => setAttempt((value) => value + 1)} /></div>}
      {loading && <div className="content-wrap"><SectionHeading eyebrow="LIVE FROM THE CATALOG" title="Popular on ADEZ FLIX" /><LoadingCards count={6} /></div>}
      {!loading && !error && data && rows.length === 0 && <div className="content-wrap"><StateMessage title="No titles found" message="The API is online, but these shelves are empty right now. Try again in a moment." retry={() => setAttempt((value) => value + 1)} /></div>}
      {!loading && !error && rows.map((row, index) => <section className="content-wrap media-section" key={`${row.title}-${index}`}><SectionHeading eyebrow={index === 0 ? "LIVE FROM THE API" : undefined} title={row.title} href={row.title.includes("TV") ? "/tv-shows" : "/movies"} /><div className="media-rail">{row.items.map((item) => <MediaCard key={item.id} item={item} />)}</div></section>)}
      <section className="content-wrap local-shelves">
        <div className="media-section"><SectionHeading eyebrow="THIS DEVICE ONLY" title="Continue Watching" href="/my-list" />{continueWatching.length ? <div className="media-rail">{continueWatching.map((entry) => <ContinueCard key={`${entry.item.id}:${entry.season || 0}:${entry.episode || 0}`} entry={entry} />)}</div> : <p className="local-shelf-note">Your viewing progress appears here after you watch a title in this browser.</p>}</div>
        {!seed && <div className="local-shelf-note local-shelf-note--recommendation"><SectionHeading eyebrow="PERSONALIZED FROM THIS DEVICE" title="Recommended For You" /><p>Save a title to My List or watch something to receive recommendations from the catalog API. ADEZ FLIX does not guess your preferences.</p><Link href="/my-list" className="text-link"><BookmarkPlus size={15} /> Open My List</Link></div>}
      </section>
      <section className="discovery-banner content-wrap"><div><span className="section-eyebrow">KEEP EXPLORING</span><h2>Stories for every kind of night.</h2><p>Step into a new genre, follow a new world, or revisit a favorite.</p></div><Link href="/search" className="button button--light">Open the catalog <ArrowRight size={16} /></Link></section>
    </main>
  );
}
