import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Film, Search, Sparkles } from "lucide-react";
import { displayType, type MediaItem } from "@/lib/adezflix-api";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`brand-mark ${compact ? "brand-mark--compact" : ""}`} aria-label="ADEZ FLIX home">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 36 36" role="presentation"><path d="M7 29 16.3 7.6a1.9 1.9 0 0 1 3.4 0L29 29" /><path d="M11.3 22.7h12.8" /><path className="brand-symbol-cut" d="m18.5 17.3 7 4.1-7 4.1z" /></svg>
      </span>
      <span className="brand-wordmark"><span>ADEZ</span><b>FLIX</b></span>
    </Link>
  );
}

export function AppHeader() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <BrandMark />
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/" className="nav-link">Home</Link>
          <Link href="/movies" className="nav-link">Movies</Link>
          <Link href="/tv-shows" className="nav-link">TV Shows</Link>
          <Link href="/live-tv" className="nav-link">Live TV</Link>
          <Link href="/my-list" className="nav-link">My List</Link>
        </nav>
        <form className="header-search" onSubmit={submit} role="search">
          <Search size={17} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles" aria-label="Search titles" />
          <button type="submit" aria-label="Submit search"><ArrowRight size={16} /></button>
        </form>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand"><BrandMark compact /><span className="footer-tagline"><Sparkles size={14} /> Your Entertainment. Your World.</span><span className="footer-free-note">FREE TO BROWSE · NO ACCOUNT REQUIRED</span></div>
      <div className="footer-credit">
        <span>Build By <strong>Arnold Adez</strong></span>
        <span>Powered by <strong>ADEZ TECH</strong></span>
        <a href="tel:+254111783552">+254111783552</a>
      </div>
    </footer>
  );
}

export function MediaCard({ item, variant = "portrait" }: { item: MediaItem; variant?: "portrait" | "landscape" }) {
  const [broken, setBroken] = useState(false);
  const isLive = displayType(item.type) === "Live";
  const detailQuery = new URLSearchParams({ type: item.type || "MOVIE", title: item.title });
  const destination = isLive
    ? `/watch/${encodeURIComponent(item.id)}?type=LIVE&title=${encodeURIComponent(item.title)}`
    : `/title/${encodeURIComponent(item.id)}?${detailQuery}`;
  return (
    <Link href={destination} className={`media-card media-card--${variant}`}>
      <div className="media-art">
        {item.poster && !broken ? <img src={item.poster} alt={`${item.title} poster`} loading="lazy" onError={() => setBroken(true)} /> : (
          <div className="poster-fallback"><Film size={29} /><span>Artwork unavailable</span></div>
        )}
        <span className="media-type">{displayType(item.type)}</span>
        <span className="card-play"><ArrowRight size={19} /></span>
      </div>
      <div className="media-card-info">
        <h3>{item.title}</h3>
        <div className="media-meta"><span>{item.year || ""}</span>{item.rating && <><i /> <span>★ {item.rating}</span></>}</div>
      </div>
    </Link>
  );
}

export function SectionHeading({ eyebrow, title, href }: { eyebrow?: string; title: string; href?: string }) {
  return (
    <div className="section-heading">
      <div>{eyebrow && <span className="section-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
      {href && <Link href={href} className="section-link">See all <ArrowRight size={15} /></Link>}
    </div>
  );
}

export function LoadingCards({ count = 6 }: { count?: number }) {
  return <div className="media-grid">{Array.from({ length: count }, (_, index) => <div className="media-card skeleton-card" key={index}><div className="skeleton-poster" /><div className="skeleton-line" /><div className="skeleton-line skeleton-line--short" /></div>)}</div>;
}

export function StateMessage({ title, message, retry, kind = "empty" }: { title: string; message: string; retry?: () => void; kind?: "empty" | "error" }) {
  return (
    <div className={`state-message state-message--${kind}`}>
      <span className="state-icon"><Film size={24} /></span>
      <h3>{title}</h3>
      <p>{message}</p>
      {retry && <button type="button" onClick={retry} className="button button--outline">Try again</button>}
    </div>
  );
}
