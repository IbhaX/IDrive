"""Playwright visual + behaviour check for every major screen.

Usage (server must be running):
    python tools/visual_check.py [--base http://localhost:5000] [--out shots] [--browser-path PATH]

For each route × viewport (desktop, tablet, mobile) × theme (dark, light) it:
  * loads the page and waits for the view to render,
  * fails on uncaught JS errors or console errors,
  * fails on horizontal overflow (content wider than the viewport),
  * saves a full-page screenshot to --out.
Then it runs a few interaction smoke tests (lesson knowledge check, vehicle
hotspot, stopping lab, hazard scenario, search overlay, reduced motion).
Exit code is non-zero if anything failed.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Optional

from playwright.sync_api import Page, sync_playwright

ROUTES: list[str] = [
    "home", "course", "course/m02", "lesson/engine-basics", "lesson/safety-laws",
    "learn", "vehicle/explore", "vehicle/lights/oil", "science", "science/stopping",
    "science/reaction", "science/engine", "hazard", "hazard/ped-crossing",
    "theory", "theory/speed", "exam", "ask", "progress",
]
VIEWPORTS: dict[str, dict[str, int]] = {
    "desktop": {"width": 1366, "height": 860},
    "tablet": {"width": 820, "height": 1100},
    "mobile": {"width": 390, "height": 844},
}


def _wait(page: Page) -> None:
    page.wait_for_function("() => document.querySelector('#app') && !document.querySelector('#app .skel')", timeout=15000)
    page.wait_for_timeout(500)


def _scroll_through(page: Page) -> None:
    """Scroll to the bottom in steps so scroll-triggered reveals fire, then back up."""
    page.evaluate("""async () => {
        const step = window.innerHeight * 0.8;
        for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
        window.scrollTo(0, 0);
    }""")
    page.wait_for_timeout(700)


def _overflow(page: Page) -> int:
    return int(page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth"))


def run(base: str, out: Path, browser_path: Optional[str]) -> int:
    out.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    with sync_playwright() as p:
        launch: dict[str, Any] = {"args": ["--no-sandbox"]}
        if browser_path:
            launch["executable_path"] = browser_path
        browser = p.chromium.launch(**launch)
        for vp_name, vp in VIEWPORTS.items():
            for theme in ("dark", "light"):
                ctx = browser.new_context(viewport=vp, device_scale_factor=1)
                ctx.add_init_script(f"localStorage.setItem('idrive-theme','{theme}')")
                page = ctx.new_page()
                errors: list[str] = []
                page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
                page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
                page.on("response", lambda r: errors.append(f"http {r.status}: {r.url}") if r.url.startswith(base) and r.status >= 400 and "/api/auth/me" not in r.url else None)
                for route in ROUTES:
                    errors.clear()
                    page.goto(f"{base}/#{route}")
                    try:
                        _wait(page)
                    except Exception as e:  # noqa: BLE001 — report and continue
                        failures.append(f"[{vp_name}/{theme}] #{route}: did not render ({e})")
                        continue
                    _scroll_through(page)
                    ov = _overflow(page)
                    if ov > 2:
                        failures.append(f"[{vp_name}/{theme}] #{route}: horizontal overflow {ov}px")
                    real = [x for x in errors if "accounts.google.com" not in x and "fonts.g" not in x]
                    if real:
                        failures.append(f"[{vp_name}/{theme}] #{route}: {real[:3]}")
                    page.screenshot(path=str(out / f"{vp_name}-{theme}-{route.replace('/', '_')}.png"), full_page=True)
                ctx.close()

        # interaction smoke tests (desktop, dark)
        ctx = browser.new_context(viewport=VIEWPORTS["desktop"])
        page = ctx.new_page()
        errs: list[str] = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        def check(name: str, ok: bool) -> None:
            if not ok:
                failures.append(f"[interaction] {name}")

        page.goto(f"{base}/#lesson/engine-basics"); _wait(page)
        for _ in range(3):
            page.click("#kcBody .opt >> nth=0")
            page.click("[data-act=kcnext]")
        check("knowledge check reaches score", page.locator(".kcdone").count() == 1)

        page.goto(f"{base}/#vehicle/explore"); _wait(page)
        page.click(".hot[data-part=brakes]", force=True)
        page.wait_for_timeout(300)
        check("vehicle hotspot shows part", "Brakes" in page.inner_text("#xInfo"))

        page.goto(f"{base}/#science/stopping"); _wait(page)
        page.fill("#inKmh", "100")
        page.dispatch_event("#inKmh", "input")
        check("stopping lab recalculates", "km/h" in page.inner_text("#stopOut") or "m short" in page.inner_text("#stopOut"))

        page.goto(f"{base}/#hazard/ped-crossing"); _wait(page)
        page.click("[data-act=hzstart]")
        page.wait_for_selector("#hzPanel [data-hz]", timeout=8000)
        page.click("#hzPanel [data-hz=ped]")
        page.click("#hzPanel [data-hzc='0']")
        check("hazard scenario resolves", page.locator("#hzPanel .fb.ok").count() == 1)

        page.keyboard.press("/")
        page.wait_for_selector("#sq", timeout=3000)
        page.fill("#sq", "oil pressure")
        page.wait_for_selector(".sr-item", timeout=5000)
        check("search returns results", page.locator(".sr-item").count() > 1)
        page.keyboard.press("Escape")
        check("interaction pages raised no errors", not errs)
        ctx.close()

        # reduced motion: content must still be visible (no stuck opacity:0)
        ctx = browser.new_context(viewport=VIEWPORTS["mobile"], reduced_motion="reduce")
        page = ctx.new_page()
        page.goto(f"{base}/#home"); _wait(page)
        hidden = page.evaluate("() => [...document.querySelectorAll('.rvl')].filter(e => getComputedStyle(e).opacity === '0').length")
        check("reduced motion leaves no hidden blocks", hidden == 0)
        ctx.close()
        browser.close()

    for f in failures:
        print("FAIL", f)
    print(f"{len(failures)} failure(s); screenshots in {out}")
    return 1 if failures else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5000")
    ap.add_argument("--out", default="shots")
    ap.add_argument("--browser-path", default=None)
    a = ap.parse_args()
    sys.exit(run(a.base.rstrip("/"), Path(a.out), a.browser_path))
