"""What a device needs to use iDrive without a connection.

The service worker fetches every URL in the manifest in the background and
keeps it in its data cache. Anything that needs an account (tests, progress
sync, the AI instructor) is deliberately left out — those need the network.
"""

from __future__ import annotations

from typing import Any

from app.services import content, curriculum


def manifest(build: str) -> dict[str, Any]:
    urls: list[str] = [
        "/api/content/index",
        "/api/content/ui",
        "/api/content/svgs",
        "/api/content/glossary",
        "/api/curriculum",
        "/api/curriculum/search-index",
        "/api/library/lights",
        "/api/library/vehicle",
        "/api/library/scenarios",
        "/api/library/references",
        "/api/auth/config",
    ]
    urls += [f"/api/content/signs/{s['id']}" for s in content.signs()]
    urls += [f"/api/content/theory/{t['id']}" for t in content.topics() if content.article(t["id"])]
    urls += [f"/api/curriculum/lessons/{lid}" for lid in curriculum.lessons_by_id()]
    return {"build": build, "count": len(urls), "urls": urls}
