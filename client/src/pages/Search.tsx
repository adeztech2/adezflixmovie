import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { apiGet, displayType, extractMedia, isRecord, type MediaItem } from "@/lib/adezflix-api";
import { addSearchHistory, getSearchHistory } from "@/lib/user-state";
import { LoadingCards, MediaCard, SectionHeading, StateMessage } from "@/components/flix/FlixChrome";

const TYPES = ["ALL", "MOVIE", "TV_SERIES", "ANIME", "MUSIC", "EDUCATION", "LIVE", "SHORT_TV", "SPORTS", "KIDS", "ASIAN", "WESTERN", "NOLLYWOOD"] as const;
const TYPE_LABELS: Record<string, string> = {
  ALL: "Everything", MOVIE: "Movies", TV_SERIES: "TV Shows", ANIME: "Anime", MUSIC: "Music", EDUCATION: "Education",
  LIVE: "Live TV", SHORT_TV: "Short TV", SPORTS: "Sports", KIDS: "Kids", ASIAN: "Asian cinema", WESTERN: "Western cinema", NOLLYWOOD: "Nollywood",
};
const UPSTREAM_BROWSE_PATHS: Record<string, string> = { SHORT_TV: "/short-tv", KIDS: "/kids", ASIAN: "/asian", WESTERN: "/western", NOLLYWOOD: "/nollywood" };
const TAB_SEARCH: Record<string, string> = { SHORT_TV: "ShortTV", SPORTS: "Sports" };
const PAGE_TYPES: Record<string, string> = { "/movies": "MOVIE", "/tv-shows": "TV_SERIES", "/live-tv": "LIVE" };

function responseHasMore(payload: unknown, page: number, count: number): boolean {
  const records = [payload, isRecord(payload) ? payload.data : undefined].filter(isRecord);
  for (const record of records) {
    for (const key of ["has_more", "hasMore"]) if (typeof record[key] === "boolean") return record[key] as boolean;
    for (const key of ["next_page", "nextPage"]) { const next = Number(record[key]); if (Number.isFinite(next)) return next > page; }
    for (const key of ["total", "total_count", "totalCount"]) { const total = Number(record[key]); if (Number.isFinite(total) && total > 0) return page * 20 < total; }
  }
  return count >= 20;
}

function matchesQuery(item: MediaItem, query: string): boolean {
  return `${item.title} ${item.originalTitle || ""} ${item.synopsis || ""} ${item.genres.join(" ")}`.toLowerCase().includes(query.toLowerCase());
}

function ArrowIcon() { return <ArrowRight size={15} />; }

export default function Search() {
  const [location, navigate] = useLocation();
  const routePath = location.split("?")[0] || window.location.pathname;
  const pageType = PAGE_TYPES[routePath];
  const params = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(params.get("q") || "");
  const [type, setType] = useState((params.get("type") || pageType || "ALL").toUpperCase());
  const [collection, setCollection] = useState("popular");
  const [genre, setGenre] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(getSearchHistory());
  const [popularTitles, setPopularTitles] = useState<MediaItem[]>([]);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    setQuery(current.get("q") || "");
    setType((current.get("type") || pageType || "ALL").toUpperCase());
    setCollection("popular");
    setGenre("");
    setPage(1);
    setSearchHistory(getSearchHistory());
  }, [location, pageType]);

  useEffect(() => {
    if (routePath !== "/search") return;
    const controller = new AbortController();
    Promise.all([
      apiGet<unknown>("/movie/popular?page=1", controller.signal).catch(() => null),
      apiGet<unknown>("/tv/popular?page=1", controller.signal).catch(() => null),
    ]).then(([movies, shows]) => {
      const unique = new Map<string, MediaItem>();
      [...extractMedia(movies), ...extractMedia(shows)].forEach((item) => unique.set(item.id, item));
      setPopularTitles([...unique.values()].slice(0, 8));
    });
    return () => controller.abort();
  }, [routePath]);

  useEffect(() => {
    const term = query.trim();
    const selectedType = TYPES.includes(type as typeof TYPES[number]) ? type : "ALL";
    if (selectedType === "SPORTS" && !term) { setItems([]); setHasMore(false); setError(""); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (page === 1) { setItems([]); setHasMore(false); }
    const timer = window.setTimeout(() => {
      let path: string;
      const upstreamPath = UPSTREAM_BROWSE_PATHS[selectedType];
      if (term) {
        if (selectedType === "LIVE") path = `/live/search?q=${encodeURIComponent(term)}&page=${page}&per_page=20`;
        else if (selectedType === "ANIME") path = `/anime/search?q=${encodeURIComponent(term)}&page=${page}&per_page=20`;
        else if (TAB_SEARCH[selectedType]) path = `/search/v2?q=${encodeURIComponent(term)}&tab=${encodeURIComponent(TAB_SEARCH[selectedType])}&page=${page}&per_page=20`;
        else path = `/search?q=${encodeURIComponent(term)}&type=${encodeURIComponent(selectedType)}&page=${page}&per_page=20`;
      } else if (routePath === "/movies") {
        if (genre) path = `/movie/genre?genre=${encodeURIComponent(genre)}&page=${page}&per_page=20`;
        else if (collection === "new") path = `/movie/new?page=${page}&per_page=20`;
        else if (collection === "top") path = `/movie/top?page=${page}&per_page=20`;
        else path = `/movie/popular?page=${page}`;
      } else if (routePath === "/tv-shows") {
        if (genre) path = `/tv/genre?genre=${encodeURIComponent(genre)}&page=${page}&per_page=20`;
        else if (collection === "new") path = `/tv/new?page=${page}&per_page=20`;
        else if (collection === "trending") path = `/tv/trending?page=${page}&per_page=20`;
        else path = `/tv/popular?page=${page}`;
      } else if (selectedType === "LIVE") path = `/live?page=${page}`;
      else if (selectedType === "ANIME") path = `/explore?type=ANIME&page=${page}&per_page=20`;
      else if (upstreamPath) path = `${upstreamPath}?page=${page}&per_page=20`;
      else path = `/explore?type=${encodeURIComponent(selectedType)}&page=${page}&per_page=20`;

      apiGet<unknown>(path, controller.signal).then((payload) => {
        let normalized = extractMedia(payload);
        if (selectedType === "LIVE") normalized = normalized.map((item) => ({ ...item, type: "LIVE" }));
        if (upstreamPath && term) normalized = normalized.filter((item) => matchesQuery(item, term));
        setItems((previous) => {
          if (page === 1) return normalized;
          const merged = new Map(previous.map((item) => [item.id, item]));
          normalized.forEach((item) => merged.set(item.id, item));
          return [...merged.values()];
        });
        setHasMore(responseHasMore(payload, page, normalized.length));
      }).catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Search is unavailable right now.");
        if (page === 1) setItems([]);
      }).finally(() => setLoading(false));
    }, page === 1 ? 220 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, type, collection, genre, routePath, attempt, page]);

  const genres = useMemo(() => [...new Set(items.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b)), [items]);
  const title = useMemo(() => {
    if (query.trim()) return `Results for “${query.trim()}”`;
    if (routePath === "/movies") return genre || ({ popular: "Popular Movies", new: "New Releases", top: "Top Movies" }[collection] || "Movies");
    if (routePath === "/tv-shows") return genre || ({ popular: "Popular TV Shows", new: "New TV Shows", trending: "Trending Series" }[collection] || "TV Shows");
    if (routePath === "/live-tv") return "Live TV & Events";
    return TYPE_LABELS[type] || "Search the catalog";
  }, [collection, genre, query, routePath, type]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) { addSearchHistory(query); setSearchHistory(getSearchHistory()); }
    setPage(1);
    const next = new URLSearchParams();
    if (query.trim()) next.set("q", query.trim());
    if (type !== "ALL") next.set("type", type);
    navigate(`/search${next.toString() ? `?${next}` : ""}`);
  };

  const dedicated = routePath === "/movies" || routePath === "/tv-shows";
  const pageCollections = routePath === "/movies" ? [["popular", "Popular"], ["new", "New Releases"], ["top", "Top Rated"]] : [["popular", "Popular"], ["new", "New Shows"], ["trending", "Trending"]];

  useEffect(() => {
    document.title = `${title} — ADEZ FLIX`;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = `Browse ${title.toLowerCase()} and provider-listed titles on ADEZ FLIX.`;
  }, [title]);

  return (
    <main className="page-shell search-page content-wrap">
      <div className="page-intro"><span className="section-eyebrow">{dedicated ? "BROWSE THE CATALOG" : "THE FULL CATALOG"}</span><h1>{routePath === "/movies" ? "Movies" : routePath === "/tv-shows" ? "TV Shows" : routePath === "/live-tv" ? "Live TV" : "Find what moves you."}</h1><p>Search and filter live titles from the connected catalog API.</p></div>
      <form className="search-large" onSubmit={submit} role="search"><SearchIcon size={21} aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Try a title, actor, or genre" aria-label="Search the catalog" list="adezflix-search-history" /><datalist id="adezflix-search-history">{searchHistory.map((term) => <option key={term} value={term} />)}</datalist><button type="submit" className="button button--primary">Search</button></form>
      {query.trim().length >= 2 && items.length > 0 && <div className="suggestion-strip"><span className="section-eyebrow">LIVE SUGGESTIONS · PROVIDER RESULTS</span><div className="suggestion-list">{items.slice(0, 5).map((item) => <Link href={`/title/${encodeURIComponent(item.id)}`} className="suggestion-item" key={item.id}>{item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <span className="suggestion-no-art"><SearchIcon size={16} /></span>}<span className="suggestion-title"><strong>{item.title}</strong><small>{displayType(item.type)}{item.year ? ` · ${item.year}` : ""}</small></span><ArrowIcon /></Link>)}</div></div>}
      {!query.trim() && routePath === "/search" && popularTitles.length > 0 && <div className="popular-searches"><div><span className="section-eyebrow">POPULAR SEARCHES</span><p>Shortcuts from the provider's current popular movie and TV shelves.</p></div><div className="popular-search-list">{popularTitles.map((item) => <button key={item.id} type="button" onClick={() => { addSearchHistory(item.title); setSearchHistory(getSearchHistory()); setQuery(item.title); setType("ALL"); setPage(1); navigate(`/search?q=${encodeURIComponent(item.title)}`); }}><span>{item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <SearchIcon size={14} />}</span>{item.title}</button>)}</div></div>}
      {searchHistory.length > 0 && <div className="search-history"><span>Recent searches on this device</span>{searchHistory.map((term) => <button key={term} type="button" onClick={() => { setQuery(term); setPage(1); }}>{term}</button>)}</div>}
      {dedicated && <div className="collection-tabs" role="tablist" aria-label={routePath === "/movies" ? "Movie collections" : "TV collections"}>{pageCollections.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={collection === value} className={collection === value ? "is-active" : ""} onClick={() => { setCollection(value); setGenre(""); setPage(1); }}>{label}</button>)}</div>}
      {dedicated && genres.length > 0 && <div className="genre-filters"><span><SlidersHorizontal size={15} /> Genres</span><button type="button" className={!genre ? "is-active" : ""} onClick={() => { setGenre(""); setPage(1); }}>All</button>{genres.map((name) => <button type="button" key={name} className={genre === name ? "is-active" : ""} onClick={() => { setGenre(name); setPage(1); }}>{name}</button>)}</div>}
      {!dedicated && <div className="filter-row"><span><SlidersHorizontal size={15} /> Browse</span><div className="filter-pills" role="tablist" aria-label="Content type">{TYPES.map((option) => <button key={option} type="button" role="tab" aria-selected={type === option} className={`filter-pill ${type === option ? "is-active" : ""}`} onClick={() => { setType(option); setPage(1); }}>{TYPE_LABELS[option]}</button>)}</div></div>}
      <section className="results-area"><SectionHeading eyebrow={query.trim() ? "LIVE CATALOG MATCHES" : "CATALOG RESULTS"} title={title} />
        {type === "SPORTS" && !query.trim() && !loading && <StateMessage title="Search live sports" message="Enter a team, event, or competition to find sports content." />}
        {loading && page === 1 && <LoadingCards count={8} />}
        {error && items.length === 0 && !loading && <StateMessage kind="error" title="Catalog results are unavailable" message={error} retry={() => { setPage(1); setAttempt((value) => value + 1); }} />}
        {!loading && !error && type !== "SPORTS" && items.length === 0 && <StateMessage title="No matches this time" message={query.trim() ? "Try a different spelling, title, or category." : "This catalog section is empty right now. Try another category or come back later."} />}
        {items.length > 0 && <div className="media-grid">{items.map((item) => <MediaCard key={item.id} item={item} />)}</div>}
        {error && items.length > 0 && <p className="caption-hint caption-hint--error">More titles could not be loaded. {error}</p>}
        {hasMore && !loading && <button type="button" className="button button--outline load-more" onClick={() => setPage((value) => value + 1)}>Load more titles <span aria-hidden="true">↓</span></button>}
        {loading && page > 1 && <div className="loading-more"><span className="loader-dot" /> Loading more titles…</div>}
      </section>
    </main>
  );
}
