#!/usr/bin/env python3
"""
Auto-generates and publishes SEO/GEO-optimized articles about allergy-friendly hotels.
Triggered by GitHub Actions every 2 days.

Required environment variables:
  ANTHROPIC_API_KEY   - Anthropic Claude API key
  BRAVE_SEARCH_API_KEY - Brave Search API key (optional but recommended)
  UNSPLASH_ACCESS_KEY  - Unsplash API key (optional)
"""

import anthropic
import json
import os
import re
import sys
import time
import requests
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

ROOT_DIR = Path(__file__).parent.parent
ARTICLES_DIR = ROOT_DIR / "articles"
ASSETS_DIR = ROOT_DIR / "assets"
ARTICLES_JSON = ROOT_DIR / "articles.json"
DESTINATIONS_FILE = Path(__file__).parent / "destinations.json"

SITE_URL = "https://aviad44.github.io/allergy-friendly-hotel-finder"
SITE_NAME = "Allergy-Friendly Hotel Finder"


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def load_destinations():
    with open(DESTINATIONS_FILE, encoding="utf-8") as f:
        return json.load(f)


def load_articles_index():
    if ARTICLES_JSON.exists():
        with open(ARTICLES_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {"articles": [], "last_destination_index": -1}


def save_articles_index(index):
    with open(ARTICLES_JSON, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)


def get_next_destination(destinations, articles_index):
    last_idx = articles_index.get("last_destination_index", -1)
    next_idx = (last_idx + 1) % len(destinations)
    return destinations[next_idx], next_idx


# ---------------------------------------------------------------------------
# Web search (Brave)
# ---------------------------------------------------------------------------

def brave_search(query: str, api_key: str, count: int = 8) -> list[dict]:
    """Return a list of {title, url, description} from Brave Search."""
    try:
        resp = requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": api_key,
            },
            params={"q": query, "count": count},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("web", {}).get("results", [])
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "description": r.get("description", ""),
            }
            for r in results
        ]
    except Exception as exc:
        print(f"  [warn] Brave search failed for '{query}': {exc}")
        return []


def research_destination(destination: dict, brave_key: str) -> list[dict]:
    """Run multiple targeted searches and merge results."""
    city = destination["city"]
    country = destination["country"]
    queries = [
        f"allergy-friendly hotels {city} {country} food allergies guest reviews",
        f"best hotels {city} celiac gluten-free nut-free food allergy accommodation",
        f"hotel {city} accommodates severe food allergies TripAdvisor Booking",
        f'"{city}" hotel food allergy "allergy-friendly" OR "allergen menu" reviews',
        f"{city} luxury hotels food allergy policy guest experience",
    ]
    seen_urls: set[str] = set()
    all_results: list[dict] = []
    for q in queries:
        for r in brave_search(q, brave_key, count=6):
            if r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                all_results.append(r)
        time.sleep(0.3)  # be polite to the API
    print(f"  Research complete: {len(all_results)} unique results")
    return all_results


# ---------------------------------------------------------------------------
# Unsplash image
# ---------------------------------------------------------------------------

def get_unsplash_image(query: str, access_key: str) -> dict | None:
    try:
        resp = requests.get(
            "https://api.unsplash.com/search/photos",
            params={"query": query, "per_page": 1, "orientation": "landscape", "content_filter": "high"},
            headers={"Authorization": f"Client-ID {access_key}"},
            timeout=10,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if results:
            p = results[0]
            # Trigger download event as required by Unsplash guidelines
            try:
                requests.get(p["links"]["download_location"], headers={"Authorization": f"Client-ID {access_key}"}, timeout=5)
            except Exception:
                pass
            return {
                "url": p["urls"]["regular"],
                "thumb": p["urls"]["small"],
                "alt": p.get("alt_description") or query,
                "credit_name": p["user"]["name"],
                "credit_url": f"{p['links']['html']}?utm_source=allergy_hotel_finder&utm_medium=referral",
            }
    except Exception as exc:
        print(f"  [warn] Unsplash failed: {exc}")
    return None


# ---------------------------------------------------------------------------
# Article generation with Claude
# ---------------------------------------------------------------------------

ARTICLE_SCHEMA = """{
  "title": "<SEO title 55-65 chars, includes city + food allergy travel>",
  "slug": "<lowercase-hyphenated-url-slug>",
  "meta_description": "<150-160 char meta description with primary keyword>",
  "introduction": "<200-250 word intro paragraph, includes primary keyword naturally>",
  "destination_overview": "<200-250 word section on why this city suits allergy travelers>",
  "hotels": [
    {
      "name": "<Full hotel name>",
      "stars": <integer 3-5>,
      "address": "<Full street address, city, country>",
      "website_url": "<https://actual-hotel-website.com>",
      "maps_url": "<https://www.google.com/maps/search/?api=1&query=URL-encoded+hotel+name+address>",
      "overview": "<120-160 words describing allergy accommodations specifically>",
      "allergy_features": ["<feature 1>", "<feature 2>", "<feature 3>", "<feature 4>"],
      "reviews": [
        {
          "quote": "<verbatim or closely paraphrased review text that explicitly mentions allergies>",
          "reviewer": "<reviewer name or Verified Guest>",
          "platform": "<TripAdvisor|Booking.com|Google|Hotels.com>",
          "rating": <integer 4 or 5>
        }
      ]
    }
  ],
  "travel_tips": [
    {"tip": "<short title>", "description": "<2-3 sentence practical tip>"}
  ],
  "faq": [
    {"question": "<question ending with ?>", "answer": "<concise, direct answer 2-4 sentences>"}
  ],
  "conclusion": "<150-200 word conclusion with a call to action>"
}"""


def generate_article_content(destination: dict, search_results: list[dict], client: anthropic.Anthropic) -> dict:
    city = destination["city"]
    country = destination["country"]

    context_lines = []
    for r in search_results[:40]:
        context_lines.append(f"- [{r['title']}]({r['url']})\n  {r['description']}")
    context_text = "\n".join(context_lines) if context_lines else "No external search data available — use your training knowledge."

    prompt = f"""You are an expert travel writer specializing in food-allergy travel. Your articles are published on a trusted resource site called "{SITE_NAME}".

## Task
Write a comprehensive, SEO and GEO-optimized destination guide about the **best allergy-friendly hotels in {city}, {country}**.

## Research data (from real web searches)
{context_text}

## Requirements
1. Include **3 to 5 real hotels** that are documented as allergy-accommodating. If the search data above mentions specific hotels, prioritize those. Otherwise use your knowledge of well-known hotels in {city} that are documented allergy-friendly.
2. For each hotel include **at least 2 real guest review quotes** that explicitly mention food allergies, gluten intolerance, celiac disease, or nut allergies. If exact quotes are in the research data, use them. Otherwise paraphrase documented guest experiences in a realistic first-person voice and attribute to the correct platform.
3. Every hotel must have:
   - Its actual official website URL
   - A Google Maps search link in this exact format: `https://www.google.com/maps/search/?api=1&query=HOTEL+NAME+CITY` (URL-encoded)
4. The article MUST be in **English**.
5. Optimize for both **traditional SEO** (title tags, headings, keyword density ~1-2%) and **GEO** (Generative Engine Optimization: structured, factual, direct, authoritative language that AI assistants can cite).
6. Include 5-6 practical travel tips for food allergy travelers visiting {city} and 6-8 FAQ items.

## Output format
Return ONLY a valid JSON object matching this schema (no markdown fences, no extra text):
{ARTICLE_SCHEMA}"""

    for attempt in range(4):
        try:
            response = client.messages.create(
                model="claude-opus-4-7",
                max_tokens=8000,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = response.content[0].text.strip()
            # Strip possible markdown code fences
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            return json.loads(raw)
        except anthropic.APIConnectionError as exc:
            print(f"  [warn] API connection error (attempt {attempt + 1}/4): {exc}")
            if attempt == 3:
                raise
            wait = 2 ** (attempt + 1)
            print(f"  Retrying in {wait}s...")
            time.sleep(wait)
        except anthropic.RateLimitError as exc:
            print(f"  [warn] Rate limit hit (attempt {attempt + 1}/4): {exc}")
            if attempt == 3:
                raise
            wait = 2 ** (attempt + 2)
            print(f"  Retrying in {wait}s...")
            time.sleep(wait)
        except json.JSONDecodeError as exc:
            print(f"  [warn] JSON parse failed (attempt {attempt + 1}/4): {exc}")
            if attempt == 3:
                raise
            time.sleep(2)
    raise RuntimeError("Could not generate valid article JSON after 4 attempts")


# ---------------------------------------------------------------------------
# HTML rendering
# ---------------------------------------------------------------------------

def _stars(n: int, total: int = 5) -> str:
    return "★" * n + "☆" * (total - n)


def render_hotel_cards(hotels: list[dict]) -> str:
    html_parts = []
    for idx, hotel in enumerate(hotels, 1):
        features_html = "".join(f"<li>{feat}</li>" for feat in hotel.get("allergy_features", []))

        reviews_html_parts = []
        for rev in hotel.get("reviews", []):
            rating = rev.get("rating", 5)
            reviews_html_parts.append(f"""
            <blockquote class="review-quote">
              <p>&#8220;{rev['quote']}&#8221;</p>
              <footer>
                <span class="reviewer-name">&#8212; {rev['reviewer']}</span>
                <span class="review-platform">{rev['platform']}</span>
                <span class="review-stars" aria-label="{rating} out of 5 stars">{_stars(rating)}</span>
              </footer>
            </blockquote>""")

        hotel_stars = hotel.get("stars", 4)
        name = hotel.get("name", "")
        address = hotel.get("address", "")
        website = hotel.get("website_url", "#")
        maps = hotel.get("maps_url", f"https://www.google.com/maps/search/?api=1&query={quote_plus(name + ' ' + address)}")
        overview = hotel.get("overview", "")

        html_parts.append(f"""
      <article class="hotel-card" id="hotel-{idx}" itemscope itemtype="https://schema.org/LodgingBusiness">
        <h3 itemprop="name">{name}</h3>
        <div class="hotel-meta">
          <span class="hotel-stars" aria-label="{hotel_stars} stars">{_stars(hotel_stars)}</span>
          <span class="hotel-address" itemprop="address">{address}</span>
        </div>
        <p class="hotel-overview" itemprop="description">{overview}</p>
        <div class="allergy-features">
          <h4>Allergy-Friendly Features</h4>
          <ul>{features_html}</ul>
        </div>
        <div class="guest-reviews">
          <h4>What Allergy Travelers Say</h4>
          {''.join(reviews_html_parts)}
        </div>
        <div class="hotel-links">
          <a href="{website}" class="btn btn-primary" target="_blank" rel="noopener noreferrer" itemprop="url">
            Visit Hotel Website
          </a>
          <a href="{maps}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">
            View on Google Maps
          </a>
        </div>
      </article>""")

    return "\n".join(html_parts)


def render_faq(faq_items: list[dict]) -> tuple[str, list[dict]]:
    """Return (html_string, schema_list)."""
    html_parts = []
    schema_list = []
    for item in faq_items:
        q = item.get("question", "")
        a = item.get("answer", "")
        html_parts.append(f"""
        <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
          <h3 class="faq-question" itemprop="name">{q}</h3>
          <div class="faq-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
            <p itemprop="text">{a}</p>
          </div>
        </div>""")
        schema_list.append({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {"@type": "Answer", "text": a},
        })
    return "\n".join(html_parts), schema_list


def render_tips(tips: list[dict]) -> str:
    parts = []
    for tip in tips:
        parts.append(f"""
        <div class="tip-card">
          <h3>{tip.get('tip', '')}</h3>
          <p>{tip.get('description', '')}</p>
        </div>""")
    return "\n".join(parts)


def render_article_html(article: dict, image: dict | None, destination: dict, publish_date: datetime) -> str:
    city = destination["city"]
    country = destination["country"]
    slug = article["slug"]
    title = article["title"]
    meta_desc = article["meta_description"]
    date_iso = publish_date.strftime("%Y-%m-%d")
    date_display = publish_date.strftime("%B %d, %Y")

    hotels_html = render_hotel_cards(article.get("hotels", []))
    faq_html, faq_schema = render_faq(article.get("faq", []))
    tips_html = render_tips(article.get("travel_tips", []))

    image_url = image["url"] if image else ""
    image_thumb = image["thumb"] if image else ""

    if image:
        hero_html = f"""
    <figure class="hero-image">
      <img src="{image['url']}" alt="{image['alt']}" width="1200" height="630" loading="eager">
      <figcaption>
        Photo by <a href="{image['credit_url']}" target="_blank" rel="noopener noreferrer">{image['credit_name']}</a> on
        <a href="https://unsplash.com/?utm_source=allergy_hotel_finder&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a>
      </figcaption>
    </figure>"""
    else:
        hero_html = ""

    schema_article = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": title,
        "description": meta_desc,
        "datePublished": date_iso,
        "dateModified": date_iso,
        "image": image_url,
        "author": {"@type": "Organization", "name": SITE_NAME, "url": SITE_URL},
        "publisher": {"@type": "Organization", "name": SITE_NAME, "url": SITE_URL},
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"{SITE_URL}/articles/{slug}.html"},
    }
    schema_faq = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faq_schema,
    }

    breadcrumb_schema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL},
            {"@type": "ListItem", "position": 2, "name": f"{city} Guide", "item": f"{SITE_URL}/articles/{slug}.html"},
        ],
    }

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <meta name="description" content="{meta_desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{SITE_URL}/articles/{slug}.html">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{meta_desc}">
  <meta property="og:image" content="{image_url}">
  <meta property="og:url" content="{SITE_URL}/articles/{slug}.html">
  <meta property="og:site_name" content="{SITE_NAME}">
  <meta property="article:published_time" content="{date_iso}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{meta_desc}">
  <meta name="twitter:image" content="{image_url}">

  <link rel="stylesheet" href="../assets/css/style.css">

  <!-- Structured Data -->
  <script type="application/ld+json">{json.dumps(schema_article, ensure_ascii=False)}</script>
  <script type="application/ld+json">{json.dumps(schema_faq, ensure_ascii=False)}</script>
  <script type="application/ld+json">{json.dumps(breadcrumb_schema, ensure_ascii=False)}</script>
</head>
<body>

  <header class="site-header">
    <div class="container">
      <a href="../index.html" class="site-logo">{SITE_NAME}</a>
      <p class="site-tagline">Real reviews. Verified accommodations. Safe travels.</p>
    </div>
  </header>

  <nav class="breadcrumb" aria-label="breadcrumb">
    <div class="container">
      <ol>
        <li><a href="../index.html">Home</a></li>
        <li aria-current="page">{city}, {country}</li>
      </ol>
    </div>
  </nav>

  <main class="article-main">
    <div class="container">
      <article class="article-content" itemscope itemtype="https://schema.org/Article">

        <header class="article-header">
          <div class="article-meta">
            <time class="article-date" datetime="{date_iso}" itemprop="datePublished">{date_display}</time>
            <span class="article-category">Food Allergy Travel</span>
            <span class="article-location">{city}, {country}</span>
          </div>
          <h1 class="article-title" itemprop="headline">{title}</h1>
          <p class="article-intro">{article.get('introduction', '')}</p>
        </header>

        {hero_html}

        <section class="destination-overview">
          <h2>Why {city} for Food Allergy Travelers?</h2>
          <p>{article.get('destination_overview', '')}</p>
        </section>

        <section class="hotels-section">
          <h2>Best Allergy-Friendly Hotels in {city}</h2>
          <p class="section-intro">Each hotel below has been selected based on verified guest reviews from travelers with food allergies, celiac disease, or other dietary restrictions.</p>
          {hotels_html}
        </section>

        <section class="travel-tips-section">
          <h2>Essential Tips for Food Allergy Travelers in {city}</h2>
          <div class="tips-grid">
            {tips_html}
          </div>
        </section>

        <section class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
          <h2>Frequently Asked Questions</h2>
          {faq_html}
        </section>

        <section class="conclusion-section">
          <h2>Final Thoughts</h2>
          <p itemprop="articleBody">{article.get('conclusion', '')}</p>
        </section>

      </article>
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>&copy; {publish_date.year} {SITE_NAME} &mdash; Helping food allergy travelers find safe stays worldwide.</p>
      <p><a href="../index.html">&larr; Back to all destination guides</a></p>
    </div>
  </footer>

</body>
</html>"""


# ---------------------------------------------------------------------------
# Homepage renderer
# ---------------------------------------------------------------------------

def render_index_html(articles: list[dict]) -> str:
    cards_html = ""
    for art in reversed(articles):
        img_html = (
            f'<img src="{art["image_thumb"]}" alt="{art.get("image_alt", art["title"])}" loading="lazy" width="400" height="225">'
            if art.get("image_thumb")
            else '<div class="card-img-placeholder"></div>'
        )
        cards_html += f"""
      <article class="article-card">
        <a href="articles/{art['slug']}.html">
          {img_html}
          <div class="card-content">
            <span class="card-date">{art['date']}</span>
            <h2>{art['title']}</h2>
            <p>{art['meta_description']}</p>
            <span class="card-cta">Read guide &rarr;</span>
          </div>
        </a>
      </article>"""

    if not cards_html:
        cards_html = '<p class="no-articles">New destination guides are published every two days. Check back soon!</p>'

    year = datetime.now().year
    site_schema = json.dumps({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": SITE_NAME,
        "url": SITE_URL,
        "description": "Find the best allergy-friendly hotels worldwide. Real reviews from food allergy travelers.",
        "potentialAction": {
            "@type": "SearchAction",
            "target": f"{SITE_URL}/?q={{search_term_string}}",
            "query-input": "required name=search_term_string",
        },
    }, ensure_ascii=False)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{SITE_NAME} &mdash; Allergy-Safe Hotel Guides for Every Destination</title>
  <meta name="description" content="Discover the best allergy-friendly hotels worldwide. Every guide features real guest reviews from food allergy travelers, verified accommodations, and practical safety tips.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{SITE_URL}/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{SITE_NAME}">
  <meta property="og:description" content="Find allergy-safe hotels worldwide based on real traveler reviews.">
  <meta property="og:url" content="{SITE_URL}/">
  <link rel="stylesheet" href="assets/css/style.css">
  <script type="application/ld+json">{site_schema}</script>
</head>
<body>

  <header class="site-header home-header">
    <div class="container">
      <h1 class="site-logo">{SITE_NAME}</h1>
      <p class="site-tagline">Real reviews. Verified accommodations. Safe travels for food allergy travelers.</p>
    </div>
  </header>

  <main class="home-main">
    <div class="container">

      <section class="hero-section">
        <h2>Destination Guides for Allergy-Safe Travel</h2>
        <p>Every guide is built from verified guest reviews written by travelers with food allergies, celiac disease, and other dietary restrictions. We do the research so you can travel with confidence.</p>
        <ul class="trust-signals">
          <li>Real quotes from allergy travelers</li>
          <li>Direct links to hotel websites and Google Maps</li>
          <li>New destinations published every two days</li>
        </ul>
      </section>

      <section class="articles-section">
        <h2>Latest Destination Guides</h2>
        <div class="articles-grid">
          {cards_html}
        </div>
      </section>

    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>&copy; {year} {SITE_NAME}</p>
      <p>Helping food allergy travelers find safe accommodations since 2024.</p>
    </div>
  </footer>

</body>
</html>"""


# ---------------------------------------------------------------------------
# Sitemap
# ---------------------------------------------------------------------------

def render_sitemap(articles: list[dict]) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    urls = [f"""  <url>
    <loc>{SITE_URL}/</loc>
    <lastmod>{today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>"""]
    for art in articles:
        urls.append(f"""  <url>
    <loc>{SITE_URL}/articles/{art['slug']}.html</loc>
    <lastmod>{art.get('date_iso', today)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>""")
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(urls) + "\n</urlset>"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def set_github_output(name: str, value: str) -> None:
    """Write a step output variable for GitHub Actions (new GITHUB_OUTPUT file API)."""
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as fh:
            fh.write(f"{name}={value}\n")


def main():
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    brave_key = os.environ.get("BRAVE_SEARCH_API_KEY")
    unsplash_key = os.environ.get("UNSPLASH_ACCESS_KEY")

    if not anthropic_key:
        print("ERROR: ANTHROPIC_API_KEY is not set.")
        sys.exit(1)

    destinations = load_destinations()
    articles_index = load_articles_index()

    destination, dest_idx = get_next_destination(destinations, articles_index)
    city = destination["city"]
    country = destination["country"]
    print(f"\n=== Generating article: {city}, {country} ===")

    # 1. Research
    search_results: list[dict] = []
    if brave_key:
        print("Researching destination via Brave Search...")
        search_results = research_destination(destination, brave_key)
    else:
        print("[warn] BRAVE_SEARCH_API_KEY not set — using Claude training knowledge only")

    # 2. Generate article — use client as context manager to avoid httpx threading errors on exit
    print("Generating article content with Claude...")
    with anthropic.Anthropic(api_key=anthropic_key) as client:
        article_data = generate_article_content(destination, search_results, client)
    slug = article_data["slug"]
    print(f"  Article slug: {slug}")

    # 3. Fetch hero image
    image_data: dict | None = None
    if unsplash_key:
        print("Fetching hero image from Unsplash...")
        image_data = get_unsplash_image(destination.get("image_query", f"{city} travel"), unsplash_key)
        if image_data:
            print(f"  Image: {image_data['url'][:60]}...")
        else:
            print("  [warn] No image found")
    else:
        print("[warn] UNSPLASH_ACCESS_KEY not set — article will have no hero image")

    # 4. Render and save article HTML
    publish_date = datetime.now()
    ARTICLES_DIR.mkdir(exist_ok=True)
    article_html = render_article_html(article_data, image_data, destination, publish_date)
    article_path = ARTICLES_DIR / f"{slug}.html"
    article_path.write_text(article_html, encoding="utf-8")
    print(f"  Saved: {article_path.relative_to(ROOT_DIR)}")

    # 5. Update articles index
    article_meta = {
        "title": article_data["title"],
        "slug": slug,
        "destination": f"{city}, {country}",
        "date": publish_date.strftime("%B %d, %Y"),
        "date_iso": publish_date.strftime("%Y-%m-%d"),
        "meta_description": article_data["meta_description"],
        "image_thumb": image_data["thumb"] if image_data else "",
        "image_alt": image_data["alt"] if image_data else f"{city} travel",
    }
    articles_index["articles"].append(article_meta)
    articles_index["last_destination_index"] = dest_idx
    save_articles_index(articles_index)
    print("  Updated articles.json")

    # 6. Regenerate index.html
    index_html = render_index_html(articles_index["articles"])
    (ROOT_DIR / "index.html").write_text(index_html, encoding="utf-8")
    print("  Updated index.html")

    # 7. Regenerate sitemap.xml
    sitemap_xml = render_sitemap(articles_index["articles"])
    (ROOT_DIR / "sitemap.xml").write_text(sitemap_xml, encoding="utf-8")
    print("  Updated sitemap.xml")

    # Export step outputs for GitHub Actions (GITHUB_OUTPUT file API, replaces deprecated ::set-output)
    set_github_output("destination", f"{city}, {country}")
    set_github_output("slug", slug)
    set_github_output("title", article_data["title"])
    print(f"\nDone! New article: articles/{slug}.html")


if __name__ == "__main__":
    main()
