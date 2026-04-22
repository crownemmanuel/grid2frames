---
title: Grid2Frame
sdk: gradio
sdk_version: 6.1.0
app_file: app.py
license: mit
---

# Grid2Frame

Extract individual images from a grid, collage, storyboard, or contact-sheet style image.

Grid2Frame is a Python-only Gradio app powered by OpenCV. Upload a grid image, let the detector find the frame boundaries, preview the detected boxes, inspect the extracted frames, and download everything as a ZIP.

## Features

- Upload JPG, PNG, WebP, and other OpenCV-readable image formats.
- Detect variable grid layouts with dark, light, or automatic separator detection.
- Preview detected frame boundaries before downloading.
- Export individual frames as JPG, PNG, or WebP.
- Download all extracted frames as a ZIP.
- Run locally or deploy to free Python-friendly hosts such as Hugging Face Spaces.

## Demo Workflow

1. Upload a grid image.
2. Adjust `Sensitivity`, `Minimum frame`, or `Separator` if needed.
3. Click `Extract`.
4. Download the generated ZIP with `Download all frames`.

## Requirements

- Python 3.10+
- `pip`

The app dependencies are listed in [requirements.txt](requirements.txt).

## Run Locally

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 app.py
```

Then open the local URL printed by Gradio, usually `http://127.0.0.1:7860`.

## CLI Usage

You can also run the detector without the UI:

```bash
.venv/bin/python3 scripts/extract_grid.py path/to/grid-image.png
```

The CLI prints JSON containing the detected image size, rows, columns, and crop regions.

## Deploy Free

### Hugging Face Spaces

Hugging Face Spaces is the recommended free host for the Python-only app.

1. Create a new Space.
2. Choose `Gradio` as the SDK.
3. Push this repository.

Spaces will install [requirements.txt](requirements.txt) and run [app.py](app.py).

## Project Structure

```text
.
├── app.py                    # Gradio application
├── grid2frame/
│   ├── __init__.py
│   └── extractor.py          # OpenCV detection and extraction logic
├── scripts/
│   └── extract_grid.py       # JSON-emitting CLI detector
├── requirements.txt
├── README.md
└── LICENSE
```

## Branches

- `main`: Python-only Gradio app.
- `nextjs`: previous Next.js implementation preserved for reference.

## Contributing

Issues and pull requests are welcome. Good areas to improve include:

- Better detection for grids without solid separators.
- Manual crop correction tools.
- Batch upload support.
- More export naming options.
- Tests with a wider set of grid layouts.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development notes.

## License

MIT. See [LICENSE](LICENSE).
