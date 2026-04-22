# Grid2Frame

Extract individual images from a grid or contact-sheet style image.

Grid2Frame is now a Python-only Gradio app, which makes it easy to run on free Python-friendly hosts such as Hugging Face Spaces. It uses OpenCV to detect full grid separator lines, previews the detected frame boxes, shows the extracted frames, and creates a ZIP download.

## Run Locally

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 app.py
```

Then open the local URL printed by Gradio.

## Deploy Free

Recommended target: Hugging Face Spaces.

1. Create a new Space.
2. Select `Gradio` as the SDK.
3. Push this repo.

Hugging Face Spaces will install `requirements.txt` and run `app.py`.

## Next.js Version

The previous Next.js implementation is preserved on the `nextjs` branch.
