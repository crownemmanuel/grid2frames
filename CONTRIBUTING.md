# Contributing

Thanks for helping improve Grid2Frame.

## Development Setup

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 app.py
```

## Checks

Run these before opening a pull request:

```bash
.venv/bin/python3 -m py_compile app.py grid2frame/extractor.py scripts/extract_grid.py
.venv/bin/python3 scripts/extract_grid.py path/to/sample-grid.png
```

## Pull Requests

- Keep changes focused.
- Include before/after notes for detection changes.
- Avoid committing generated images, ZIP files, virtual environments, or caches.
- Add sample dimensions and expected row/column counts when reporting detection issues.
