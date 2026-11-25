.PHONY: install dev test extract lint smoke

PY ?= python
PIP ?= pip
UVICORN ?= uvicorn

install:
	$(PIP) install -r requirements-dev.txt

extract:
	node tools/extract_data.mjs

dev:
	$(UVICORN) app.main:app --reload --host 127.0.0.1 --port 8000

test:
	$(PY) -m pytest -q

lint:
	$(PY) -m compileall -q app tests tools

smoke:
	$(PY) tools/smoke.py
