"""`idrive` console entry point - runs the uvicorn server."""

from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="idrive", description="Run the IDrive web app."
    )
    parser.add_argument("--host", default="127.0.0.1", help="bind host (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=5001, help="bind port (default 5001)")
    parser.add_argument("--reload", action="store_true", help="uvicorn --reload")
    args = parser.parse_args()
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
