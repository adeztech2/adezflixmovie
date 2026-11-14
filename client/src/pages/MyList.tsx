import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bookmark, Clock3, History, Trash2 } from "lucide-react";
import { MediaCard, SectionHeading, StateMessage } from "@/components/flix/FlixChrome";
import { clearWatchHistory, getContinueWatching, getMyList, getWatchHistory, subscribeLocalLibrary, type WatchProgress } from "@/lib/user-state";
import type { MediaItem } from "@/lib/adezflix-api";

type Tab = "list" | "continue" | "history";

function ProgressCard({ entry }: { entry: WatchProgress }) {
  const item = entry.item;
  const params = new URLSearchParams({ type: item.type || "MOVIE", title: item.title, start: String(Math.floor(entry.position)) });
  if (entry.season) params.set("season", String(entry.season));
  if (entry.episode) params.set("episode", String(entry.episode));
  const percent = Math.min(100, Math.max(0, (entry.position / entry.duration) * 100));
  return (
    <Link href={`/watch/${encodeURIComponent(item.id)}?${params}`} className="media-card progress-card">
      <div className="media-art">{item.poster ? <img src={item.poster} alt={`${item.title} poster`} loading="lazy" /> : <div className="poster-fallback"><Clock3 size={26} /><span>Artwork unavailable</span></div>}<span className="progress-track"><i style={{ width: `${percent}%` }} /></span></div>
      <div className="media-card-info"><h3>{item.title}</h3><div className="media-meta"><span>{entry.season ? `S${entry.season} · E${entry.episode || 1}` : `${Math.round(percent)}% watched`}</span></div></div>
    </Link>
  );
}

export default function MyList() {
  const [tab, setTab] = useState<Tab>("list");
  const [, refresh] = useState(0);
  useEffect(() => subscribeLocalLibrary(() => refresh((value) => value + 1)), []);
  const list: MediaItem[] = getMyList();
  const continueWatching = getContinueWatching();
  const history = getWatchHistory();

  return (
    <main className="page-shell content-wrap library-page">
      <div className="page-intro"><span className="section-eyebrow">YOUR ADEZ FLIX</span><h1>My List</h1><p>Your saved titles and viewing history are stored on this device only.</p></div>
      <div className="library-tabs" role="tablist" aria-label="My List sections">
        <button type="button" role="tab" aria-selected={tab === "list"} className={tab === "list" ? "is-active" : ""} onClick={() => setTab("list")}><Bookmark size={15} /> Saved ({list.length})</button>
        <button type="button" role="tab" aria-selected={tab === "continue"} className={tab === "continue" ? "is-active" : ""} onClick={() => setTab("continue")}><Clock3 size={15} /> Continue Watching ({continueWatching.length})</button>
        <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}><History size={15} /> History ({history.length})</button>
      </div>
      {tab === "list" && (list.length ? <><SectionHeading title="Saved to this device" /><div className="media-grid">{list.map((item) => <MediaCard item={item} key={item.id} />)}</div></> : <StateMessage title="Your list is ready" message="Save a title from its details page and it will appear here on this device." />)}
      {tab === "continue" && (continueWatching.length ? <><SectionHeading title="Continue Watching" /><div className="media-grid">{continueWatching.map((entry) => <ProgressCard entry={entry} key={`${entry.item.id}:${entry.season || 0}:${entry.episode || 0}`} />)}</div></> : <StateMessage title="Nothing to resume yet" message="Progress appears here after you watch a title in this browser." />)}
      {tab === "history" && (history.length ? <><div className="history-heading"><SectionHeading title="Viewing history" /><button className="button button--outline" type="button" onClick={clearWatchHistory}><Trash2 size={15} /> Clear history</button></div><div className="media-grid">{history.map((entry) => <MediaCard item={entry.item} key={`${entry.item.id}:${entry.season || 0}:${entry.episode || 0}`} />)}</div></> : <StateMessage title="No viewing history" message="Your local viewing history will appear here after you watch a title in this browser." />)}
      <p className="local-data-note">ADEZ FLIX is free to browse and requires no account or login. My List and history are saved only in this browser; clearing browser storage removes them.</p>
    </main>
  );
}
