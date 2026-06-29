"""
scraper-service/main.py

FastAPI microservice that scrapes sources with no public RSS feed using Scrapling.
Called by scripts/fetch.ts as an additional content source alongside RSS.

Sources:
  - Reddit (r/investing, r/technology, r/artificial, r/worldnews) — JSON API via httpx
  - GitHub Trending — StealthyFetcher (JS rendered)
  - Funder.co.il — StealthyFetcher (anti-bot, 403 on plain requests)
  - N12.co.il — StealthyFetcher (anti-bot, 403 on plain requests)

Run locally:
  pip install -r requirements.txt
  scrapling install
  uvicorn main:app --reload

Deploy: Railway (Dockerfile in this directory)
Env vars: PORT (set automatically by Railway)
"""

from fastapi import FastAPI
from scrapling.fetchers import StealthyFetcher, Fetcher
from datetime import datetime, timezone
import httpx
import re

app = FastAPI(title="NewsHub Scraper Service")


# ── Helpers ───────────────────────────────────────────────────────────────────

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_item(*, title: str, url: str, content: str, source_name: str,
              category: str, region: str, published_at: str | None = None,
              image_url: str | None = None) -> dict:
    return {
        "title": title,
        "url": url,
        "content": content,
        "publishedAt": published_at or now_iso(),
        "imageUrl": image_url,
        "source": source_name,
        "category": category,
        "region": region,
    }


# ── Reddit (JSON API — httpx, no browser needed) ──────────────────────────────

def scrape_reddit(subreddit: str, category: str, region: str, label: str) -> list[dict]:
    try:
        r = httpx.get(
            f"https://www.reddit.com/r/{subreddit}/hot.json?limit=12",
            headers={"User-Agent": "Mozilla/5.0 (compatible; NewsHubBot/1.0)"},
            follow_redirects=True,
            timeout=15,
        )
        r.raise_for_status()
        posts = r.json()["data"]["children"]
        items = []
        for post in posts:
            p = post["data"]
            if p.get("stickied") or p.get("is_video") or p.get("score", 0) < 10:
                continue
            content = p.get("selftext", "").strip()[:500] or p["title"]
            thumbnail = p.get("thumbnail", "")
            items.append(make_item(
                title=p["title"],
                url=f"https://www.reddit.com{p['permalink']}",
                content=content,
                published_at=datetime.fromtimestamp(p["created_utc"], tz=timezone.utc).isoformat(),
                source_name=label,
                category=category,
                region=region,
                image_url=thumbnail if thumbnail.startswith("http") else None,
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] Reddit r/{subreddit} failed: {e}")
        return []


# ── GitHub Trending ────────────────────────────────────────────────────────────

def scrape_github_trending() -> list[dict]:
    try:
        page = StealthyFetcher.fetch("https://github.com/trending", headless=True)
        items = []
        for repo in page.css("article.Box-row")[:8]:
            name_parts = repo.css("h2 a::text").getall()
            name = "".join(name_parts).strip().replace("\n", "").replace(" ", "")
            href = repo.css("h2 a::attr(href)").get("").strip()
            desc = (repo.css("p::text").get() or "").strip()
            if not name or not href:
                continue
            items.append(make_item(
                title=f"Trending on GitHub: {name}",
                url=f"https://github.com{href}",
                content=desc or name,
                source_name="GitHub Trending",
                category="ai-builders",
                region="world",
            ))
        return items
    except Exception as e:
        print(f"[scraper] GitHub Trending failed: {e}")
        return []


# ── Funder.co.il ──────────────────────────────────────────────────────────────

def scrape_funder() -> list[dict]:
    try:
        page = StealthyFetcher.fetch("https://funder.co.il/category/news/", headless=True)
        items = []
        for art in page.css("article")[:8]:
            title = art.css("h2 a::text, h3 a::text").get("").strip()
            url = art.css("h2 a::attr(href), h3 a::attr(href)").get("").strip()
            content = art.css(".entry-summary::text, p::text").get("").strip()
            if not title or not url:
                continue
            items.append(make_item(
                title=title,
                url=url,
                content=content[:500] or title,
                source_name="Funder",
                category="ai-builders",
                region="israel",
            ))
        return items
    except Exception as e:
        print(f"[scraper] Funder failed: {e}")
        return []


# ── N12.co.il ─────────────────────────────────────────────────────────────────

def scrape_n12() -> list[dict]:
    try:
        page = StealthyFetcher.fetch("https://www.n12.co.il/news", headless=True)
        items = []
        for art in page.css("article, [class*='ArticleItem'], [class*='article-item']")[:8]:
            title = art.css("h2::text, h3::text, [class*='title']::text").get("").strip()
            href = art.css("a::attr(href)").get("").strip()
            if not title or not href:
                continue
            url = href if href.startswith("http") else f"https://www.n12.co.il{href}"
            items.append(make_item(
                title=title,
                url=url,
                content=title,
                source_name="N12",
                category="news",
                region="israel",
            ))
        return items
    except Exception as e:
        print(f"[scraper] N12 failed: {e}")
        return []


# ── Anthropic Blog ────────────────────────────────────────────────────────────

def scrape_anthropic() -> list[dict]:
    try:
        page = Fetcher().get("https://www.anthropic.com/news")
        items = []
        seen: set[str] = set()
        for a in page.css("li a[href^='/news/']"):
            href = a.css("::attr(href)").get("").strip()
            if not href or href in seen:
                continue
            seen.add(href)
            text_parts = [t.strip() for t in a.css("::text").getall() if t.strip()]
            title = text_parts[-1] if text_parts else ""
            if not title or len(title) < 10:
                continue
            items.append(make_item(
                title=title,
                url=f"https://www.anthropic.com{href}",
                content=title,
                source_name="Anthropic Blog",
                category="ai-builders",
                region="world",
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] Anthropic Blog failed: {e}")
        return []


# ── Meta AI Blog ───────────────────────────────────────────────────────────────

def scrape_meta_ai() -> list[dict]:
    try:
        page = Fetcher().get("https://ai.meta.com/blog/")
        items = []
        seen: set[str] = set()
        for a in page.css("a[href^='https://ai.meta.com/blog/']"):
            href = a.css("::attr(href)").get("").strip()
            title = " ".join(a.css("::text").getall()).strip()
            if not href or not title or len(title) < 15 or href in seen:
                continue
            seen.add(href)
            items.append(make_item(
                title=title,
                url=href,
                content=title,
                source_name="Meta AI Blog",
                category="ai-builders",
                region="world",
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] Meta AI Blog failed: {e}")
        return []


# ── כלכליסט ────────────────────────────────────────────────────────────────────

def scrape_calcalist() -> list[dict]:
    try:
        page = StealthyFetcher.fetch("https://www.calcalist.co.il/", headless=True)
        items = []
        seen: set[str] = set()
        for slot in page.css(".slotView"):
            href = slot.css(".slotTitle a::attr(href)").get("").strip()
            title = slot.css(".slotTitle a::text").get("").strip()
            if not href or "/article/" not in href or not title or href in seen:
                continue
            seen.add(href)
            items.append(make_item(
                title=title,
                url=href,
                content=title,
                source_name="כלכליסט",
                category="economy",
                region="israel",
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] כלכליסט failed: {e}")
        return []


# ── כאן 11 ─────────────────────────────────────────────────────────────────────

def scrape_kan() -> list[dict]:
    try:
        page = StealthyFetcher.fetch("https://www.kan.org.il/lobby/news/", headless=True)
        items = []
        seen: set[str] = set()
        for a in page.css("a.unstyled-link"):
            href = a.css("::attr(href)").get("").strip()
            if not href or not re.search(r'/content/kan-news/.*\d{5,}/', href):
                continue
            if href in seen:
                continue
            seen.add(href)
            text_parts = [t.strip() for t in a.css("::text").getall() if t.strip()]
            title = text_parts[0] if text_parts else ""
            if not title:
                continue
            items.append(make_item(
                title=title,
                url=href,
                content=title,
                source_name="כאן 11",
                category="news",
                region="israel",
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] כאן 11 failed: {e}")
        return []


# ── Sport1 ─────────────────────────────────────────────────────────────────────

def scrape_sport1() -> list[dict]:
    try:
        page = Fetcher().get("https://sport1.maariv.co.il/")
        items = []
        seen: set[str] = set()
        for a in page.css("a.image-wrapper"):
            href = a.css("::attr(href)").get("").strip()
            if not href or "/article/" not in href or href in seen:
                continue
            seen.add(href)
            title = a.css("h3.article-card-title::text").get("").strip()
            if not title:
                continue
            items.append(make_item(
                title=title,
                url=href,
                content=title,
                source_name="Sport1",
                category="sports",
                region="israel",
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] Sport1 failed: {e}")
        return []


# ── TheMarker ─────────────────────────────────────────────────────────────────

def scrape_themarker() -> list[dict]:
    try:
        page = Fetcher().get("https://www.themarker.com/")
        items = []
        seen: set[str] = set()
        for art in page.css("article"):
            href = art.css("a.xhlp2gg::attr(href)").get("").strip()
            title = art.css("span.teaser-title::text").get("").strip()
            if not href or not title or href in seen:
                continue
            seen.add(href)
            url = f"https://www.themarker.com{href}" if href.startswith("/") else href
            items.append(make_item(
                title=title,
                url=url,
                content=title,
                source_name="TheMarker",
                category="economy",
                region="israel",
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] TheMarker failed: {e}")
        return []


# ── ביזפורטל ───────────────────────────────────────────────────────────────────

def scrape_bizportal() -> list[dict]:
    try:
        page = Fetcher().get("https://www.bizportal.co.il/")
        items = []
        seen: set[str] = set()
        # Featured article
        href = page.css("div.art_main_wrap a[data-tb-link]::attr(href)").get("").strip()
        title = page.css("div.art_main_wrap h1[data-tb-title]::text").get("").strip()
        if href and title and href not in seen:
            seen.add(href)
            items.append(make_item(
                title=title,
                url=href,
                content=title,
                source_name="ביזפורטל",
                category="economy",
                region="israel",
            ))
        # News list items
        for a in page.css("div#art_main_wrap_add li a"):
            href = a.css("::attr(href)").get("").strip()
            title = a.css("::text").get("").strip()
            if not href or not title or href in seen:
                continue
            seen.add(href)
            items.append(make_item(
                title=title,
                url=href,
                content=title,
                source_name="ביזפורטל",
                category="economy",
                region="israel",
            ))
            if len(items) >= 6:
                break
        return items
    except Exception as e:
        print(f"[scraper] ביזפורטל failed: {e}")
        return []


# ── Registry ──────────────────────────────────────────────────────────────────

SCRAPERS: dict[str, callable] = {
    "reddit-investing":  lambda: scrape_reddit("investing",  "economy",     "world", "Reddit r/investing"),
    "reddit-technology": lambda: scrape_reddit("technology", "tech",        "world", "Reddit r/technology"),
    "reddit-artificial": lambda: scrape_reddit("artificial", "ai-builders", "world", "Reddit r/artificial"),
    "reddit-worldnews":  lambda: scrape_reddit("worldnews",  "news",        "world", "Reddit r/worldnews"),
    "github-trending":   scrape_github_trending,
    "funder":            scrape_funder,
    "n12":               scrape_n12,
    "anthropic-blog":    scrape_anthropic,
    "meta-ai-blog":      scrape_meta_ai,
    "calcalist":         scrape_calcalist,
    "kan":               scrape_kan,
    "sport1":            scrape_sport1,
    "themarker":         scrape_themarker,
    "bizportal":         scrape_bizportal,
}

DEFAULT_SOURCES = ",".join(SCRAPERS.keys())


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "sources": list(SCRAPERS.keys())}


@app.get("/scrape")
def scrape(sources: str = DEFAULT_SOURCES) -> list[dict]:
    """
    Scrape one or more sources and return normalised article items.

    Query param `sources`: comma-separated list of source keys.
    Each item has: title, url, content, publishedAt, imageUrl, source, category, region.
    """
    results = []
    for name in [s.strip() for s in sources.split(",") if s.strip()]:
        if name not in SCRAPERS:
            print(f"[scraper] Unknown source: {name}")
            continue
        items = SCRAPERS[name]()
        print(f"[scraper] {name}: {len(items)} items")
        results.extend(items)
    return results
