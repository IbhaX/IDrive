"""Crawlable pages, sitemaps, robots.txt and llms.txt."""

from __future__ import annotations

import json
import re
from xml.etree import ElementTree

import pytest

from app.services import content
from app.web import seo


def _ld(markup: str) -> list[dict]:
    return [json.loads(m) for m in re.findall(r'<script type="application/ld\+json">(.*?)</script>', markup, re.S)]


def _text(markup: str) -> str:
    t = re.sub(r"<(script|style|svg)\b.*?</\1>", " ", markup, flags=re.S)
    return " ".join(re.sub(r"<[^>]+>", " ", t).split())


def test_every_sitemap_path_renders_in_both_languages() -> None:
    paths = seo.all_paths()
    assert len(paths) == len(set(paths)), "duplicate URLs in the sitemaps"
    assert len(paths) > 500
    titles: dict[str, str] = {}
    for p in paths:
        for lang in ("en", "ml"):
            page = seo.resolve(p, lang)
            assert page is not None, (p, lang)
            assert page.status == 200 and page.indexable, p
            assert page.path == p, (p, page.path)
            assert len(page.description) >= 50, (p, lang, page.description)
            assert '<p class="answer">' in page.body or page.static, p
            if lang == "en":
                assert page.title not in titles, f"title shared by {p} and {titles.get(page.title)}"
                titles[page.title] = p


def test_unknown_paths_and_ids_are_not_pages() -> None:
    for p in ("/nope", "/sign/not-a-sign", "/lesson/x", "/learn/zzz", "/hazard/zzz", "/science/zzz",
              "/vehicle/lights/zzz", "/vehicle/explore/zzz", "/vehicle/zzz", "/glossary/zzz", "/theory/zzz", "/sign/stop/extra"):
        assert seo.resolve(p, "en") is None, p


def test_sign_page_answers_first_and_faq_matches_visible_text() -> None:
    sid = content.signs()[0]["id"]
    markup = seo.inject(seo.shell_for_tests(), seo.resolve(f"/sign/{sid}", "en"), "en")
    assert '<html lang="en">' in markup
    assert f'<link rel="canonical" href="https://idrive.ibhax.com/sign/{sid}">' in markup
    assert 'hreflang="ml"' in markup and 'hreflang="x-default"' in markup
    assert '<meta property="og:url"' in markup
    faq = next(x for x in _ld(markup) if x["@type"] == "FAQPage")
    answer = faq["mainEntity"]["acceptedAnswer"]["text"]
    assert answer in _text(markup), "FAQ answer must be character-identical to the visible answer"
    assert len(_text(markup)) > 400


def test_malayalam_page_is_malayalam() -> None:
    sid = content.signs()[0]["id"]
    page = seo.resolve(f"/sign/{sid}", "ml")
    markup = seo.inject(seo.shell_for_tests(), page, "ml")
    assert '<html lang="ml">' in markup
    assert f"/sign/{sid}?lang=ml" in markup
    assert re.search(r"[ഀ-ൿ]", page.title)


def test_not_found_page_is_noindex() -> None:
    page = seo.not_found("en")
    markup = seo.inject(seo.shell_for_tests(), page, "en")
    assert page.status == 404
    assert '<meta name="robots" content="noindex">' in markup
    assert "hreflang" not in markup


def test_personal_screens_are_noindex() -> None:
    for p in ("/ask", "/progress"):
        assert not seo.resolve(p, "en").indexable


def test_sitemaps_are_valid_xml_with_alternates() -> None:
    idx = ElementTree.fromstring(seo.sitemap_index())
    locs = [e.text for e in idx.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert len(locs) == len(seo.SITEMAPS)
    total = 0
    for name in seo.SITEMAPS:
        root = ElementTree.fromstring(seo.sitemap(name))
        urls = list(root.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}url"))
        assert urls, name
        assert len(urls) <= 50000
        for u in urls[:3]:
            assert len(u.findall("{http://www.w3.org/1999/xhtml}link")) == 3
        total += len(urls)
    assert total == 2 * len(seo.all_paths())
    assert seo.sitemap("nope") is None


def test_robots_allows_search_and_declines_training() -> None:
    txt = seo.robots_txt()
    assert "Sitemap: https://idrive.ibhax.com/sitemap.xml" in txt
    blocks = {m.group(1): m.group(2) for m in re.finditer(r"User-agent: (\S+)\n((?:(?!User-agent).*\n)*)", txt + "\n")}
    for bot in ("GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Bytespider"):
        assert "Disallow: /\n" in blocks[bot], bot
    for bot in ("OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot", "Bingbot"):
        assert "Allow: /\n" in blocks[bot], bot
    assert "ai-train=no" in txt


def test_llms_txt_links_real_pages() -> None:
    txt = seo.llms_txt()
    assert txt.startswith("# iDrive")
    for url in re.findall(r"\((https://idrive\.ibhax\.com[^)]*)\)", txt):
        path = url.removeprefix("https://idrive.ibhax.com") or "/"
        if path.endswith((".txt", ".xml")):
            continue
        assert seo.resolve(path, "en") is not None, path
    full = seo.llms_full_txt()
    assert content.signs()[0]["name"] in full


def test_glossary_slugs_unique() -> None:
    assert len(seo.glossary_slugs()) == len(content.glossary())


def test_trust_pages_say_what_is_stored() -> None:
    priv = seo.resolve("/privacy", "en").body
    for word in ("email", "hash", "OpenRouter", "Delete account"):
        assert word in priv, word
    assert re.search(r"[ഀ-ൿ]", seo.resolve("/privacy", "ml").body)


# ---------- HTTP (full app) ----------

@pytest.mark.parametrize("path", ["/", "/learn", "/course", "/limits", "/about", "/privacy", "/terms", "/install", "/theory/gloss"])
def test_pages_serve_rendered_content(client, path: str) -> None:
    r = client.get(path)
    assert r.status_code == 200
    assert 'rel="canonical"' in r.text and '<html lang="en">' in r.text
    assert len(_text(r.text.split('<main class="wrap" id="app"', 1)[1].split("</main>", 1)[0])) > 100
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]


def test_http_404_and_api_404(client) -> None:
    r = client.get("/definitely/not/here")
    assert r.status_code == 404 and "noindex" in r.text
    r = client.get("/api/definitely-not")
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")
    assert client.get("/learn/", follow_redirects=False).status_code == 301


def test_crawler_files_served(client) -> None:
    assert client.get("/robots.txt").text.startswith("# iDrive")
    assert "<sitemapindex" in client.get("/sitemap.xml").text
    assert "<urlset" in client.get("/sitemaps/signs.xml").text
    assert client.get("/sitemaps/nope.xml").status_code == 404
    assert client.get("/llms.txt").status_code == 200
    assert client.get("/llms-full.txt").status_code == 200
    assert client.get("/shell").headers["X-Robots-Tag"] == "noindex"


def test_www_redirects_to_apex(client) -> None:
    r = client.get("/learn?x=1", headers={"host": "www.idrive.ibhax.com"}, follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "https://idrive.ibhax.com/learn?x=1"


def test_hsts_only_over_https(client) -> None:
    assert "Strict-Transport-Security" not in client.get("/").headers
    assert "Strict-Transport-Security" in client.get("/", headers={"x-forwarded-proto": "https"}).headers


def test_delete_account_removes_user(client, auth_headers: dict) -> None:
    client.put("/api/progress", json={"data": {"seen": {"stop": 1}}, "version": 0}, headers=auth_headers)
    assert client.delete("/api/auth/me", headers=auth_headers).status_code == 200
    assert client.get("/api/auth/me", headers=auth_headers).status_code == 401
    r = client.post("/api/auth/login", json={"email": "test@example.com", "password": "long-enough-password"})
    assert r.status_code == 401


def test_signup_attribution_is_cleaned_and_stored(client, db_path) -> None:
    import sqlite3

    r = client.post("/api/auth/register", json={
        "email": "ad@example.com", "password": "long-enough-password",
        "attr": {"first": {"gclid": "abc", "utm_source": "google", "evil": "x"}, "junk": 1},
    })
    assert r.status_code == 201
    row = sqlite3.connect(db_path).execute("select data from signup_attribution").fetchone()
    data = json.loads(row[0])
    assert data == {"first": {"gclid": "abc", "utm_source": "google"}}


def test_game_ids_match_games_js() -> None:
    """The server's list of game pages must match the games in games.js."""
    import re
    from app.web import seo
    src = (seo.BASE_DIR / "app" / "static" / "js" / "games.js").read_text(encoding="utf-8")
    defined = re.findall(r'^def\("(\w+)"', src, re.M)
    assert sorted(defined) == sorted(seo.GAME_IDS)
    assert len(seo.GAME_IDS) >= 30
    for gk, ids in seo.GAME_GROUPS:
        assert f'["{gk}", [{", ".join(chr(34) + i + chr(34) for i in ids)}]]' in src


def test_parking_levels_are_valid_and_solvable() -> None:
    """Car-park escape levels in games.js: no two cars share a square, every car is
    on the 6×6 grid, the red car sits on the exit row, and the stored `min` is the
    true fewest moves (one move = sliding one car any distance)."""
    import json
    import re
    from collections import deque
    from app.web import seo
    src = (seo.BASE_DIR / "app" / "static" / "js" / "games.js").read_text(encoding="utf-8")
    m = re.search(r"const PARK = (\[.*?\]);\n", src)
    assert m
    levels = json.loads(m.group(1))
    assert len(levels) >= 6

    def cells(car: tuple[int, int, int, bool]) -> list[tuple[int, int]]:
        r, c, n, h = car
        return [(r, c + k) if h else (r + k, c) for k in range(n)]

    def fewest(cars: list[tuple[int, int, int, bool]]) -> int:
        start = tuple(cars)
        dist = {start: 0}
        q = deque([start])
        while q:
            s = q.popleft()
            if s[0][1] + s[0][2] == 6:
                return dist[s]
            occ = {cell: i for i, car in enumerate(s) for cell in cells(car)}
            for i, (r, c, n, h) in enumerate(s):
                for step in (-1, 1):
                    k = 1
                    while True:
                        new = (r, c + step * k, n, h) if h else (r + step * k, c, n, h)
                        if not all(0 <= a < 6 and 0 <= b < 6 and occ.get((a, b), i) == i for a, b in cells(new)):
                            break
                        ns = s[:i] + (new,) + s[i + 1:]
                        if ns not in dist:
                            dist[ns] = dist[s] + 1
                            q.append(ns)
                        k += 1
        return -1

    for n, lv in enumerate(levels, 1):
        cars = [tuple(c) for c in lv["cars"]]
        seen: set[tuple[int, int]] = set()
        for car in cars:
            for cell in cells(car):
                assert 0 <= cell[0] < 6 and 0 <= cell[1] < 6, f"level {n}: car off the grid"
                assert cell not in seen, f"level {n}: two cars overlap at {cell}"
                seen.add(cell)
        assert cars[0][0] == 2 and cars[0][3] is True and cars[0][2] == 2, f"level {n}: red car not on the exit row"
        assert fewest(cars) == lv["min"], f"level {n}: stored min is wrong"
