from __future__ import annotations

import shutil
import tempfile
import zipfile
from pathlib import Path

import cv2
import gradio as gr

from grid2frame.extractor import annotate_regions, detect_grid, extract_frames, read_image

WORK_ROOT = Path(tempfile.gettempdir()) / "grid2frame"
WORK_ROOT.mkdir(parents=True, exist_ok=True)


def process_image(
    image_path: str | None,
    sensitivity: int,
    min_frame_size: int,
    separator_mode: str,
    output_format: str,
):
    if not image_path:
        return None, "<span>No image loaded</span>", [], None, None

    run_dir = Path(tempfile.mkdtemp(prefix="run-", dir=WORK_ROOT))
    image = read_image(image_path)
    result = detect_grid(
        image,
        min_frame_size=min_frame_size,
        sensitivity=sensitivity,
        separator_mode=separator_mode.lower(),
    )

    if not result.regions:
        return None, "<span>No frames detected</span>", [], None, None

    annotated = annotate_regions(image, result.regions)
    annotated_path = run_dir / "detected-grid.jpg"
    cv2.imwrite(str(annotated_path), annotated, [cv2.IMWRITE_JPEG_QUALITY, 92])

    extension = extension_for_format(output_format)
    image_params = encoding_params(extension)
    frame_paths: list[str] = []
    zip_path = run_dir / "grid2frame-frames.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, (region, frame) in enumerate(
            zip(result.regions, extract_frames(image, result.regions)),
            start=1,
        ):
            frame_name = (
                f"frame-{index:03d}-r{region.row + 1:02d}-c{region.col + 1:02d}"
                f".{extension}"
            )
            frame_path = run_dir / frame_name
            cv2.imwrite(str(frame_path), frame, image_params)
            frame_paths.append(str(frame_path))
            archive.write(frame_path, arcname=frame_name)

    status = (
        f"<span>{len(result.regions)} frames extracted from "
        f"{result.columns} columns x {result.rows} rows</span>"
    )
    return str(annotated_path), status, frame_paths, str(zip_path), str(zip_path)


def clear_outputs():
    return None, "<span>No image loaded</span>", [], None, None


def extension_for_format(output_format: str) -> str:
    if output_format == "PNG":
        return "png"
    if output_format == "WebP":
        return "webp"
    return "jpg"


def encoding_params(extension: str) -> list[int]:
    if extension == "jpg":
        return [cv2.IMWRITE_JPEG_QUALITY, 94]
    if extension == "webp":
        return [cv2.IMWRITE_WEBP_QUALITY, 94]
    return []


def build_app() -> gr.Blocks:
    with gr.Blocks(
        title="Grid2Frame",
    ) as demo:
        gr.HTML(
            """
            <section class="hero-band">
              <div>
                <p class="eyebrow">Grid2Frame</p>
                <h1>Extract every frame from a grid image.</h1>
              </div>
            </section>
            """
        )

        with gr.Row(elem_classes="workspace"):
            with gr.Column(scale=8, elem_classes="preview-panel"):
                input_image = gr.Image(
                    label="Upload grid",
                    sources=["upload"],
                    type="filepath",
                    height=420,
                    elem_classes="upload-box",
                )
                annotated_image = gr.Image(
                    label="Detected frames",
                    type="filepath",
                    height=420,
                    elem_classes="detected-box",
                )

            with gr.Column(scale=3, elem_classes="control-panel"):
                status = gr.HTML("<span>No image loaded</span>", elem_classes="status-line")
                sensitivity = gr.Slider(
                    minimum=0,
                    maximum=100,
                    value=58,
                    step=1,
                    label="Sensitivity",
                )
                min_frame_size = gr.Slider(
                    minimum=16,
                    maximum=600,
                    value=80,
                    step=4,
                    label="Minimum frame",
                )
                separator_mode = gr.Radio(
                    ["Auto", "Dark", "Light"],
                    value="Auto",
                    label="Separator",
                )
                output_format = gr.Radio(
                    ["JPG", "PNG", "WebP"],
                    value="JPG",
                    label="Output",
                )
                extract_button = gr.Button("Extract", variant="primary")
                zip_file = gr.File(label="Download ZIP", elem_classes="zip-download")
                zip_button = gr.DownloadButton(
                    "Download all frames",
                    variant="primary",
                    elem_classes="zip-button",
                )

        with gr.Column(elem_classes="frames-section"):
            gr.HTML("<div class='section-head'><h2>Extracted frames</h2></div>")
            gallery = gr.Gallery(
                label="",
                columns=6,
                rows=2,
                height=520,
                object_fit="cover",
                elem_classes="frame-gallery",
            )

        extract_inputs = [
            input_image,
            sensitivity,
            min_frame_size,
            separator_mode,
            output_format,
        ]
        extract_outputs = [annotated_image, status, gallery, zip_file, zip_button]

        input_image.upload(process_image, extract_inputs, extract_outputs)
        extract_button.click(process_image, extract_inputs, extract_outputs)
        input_image.clear(clear_outputs, None, extract_outputs)

    return demo


def launch_app() -> None:
    build_app().launch(
        css=APP_CSS,
        theme=gr.themes.Base(
            primary_hue="teal",
            neutral_hue="slate",
            font=["Arial", "Helvetica", "sans-serif"],
        ),
    )


APP_CSS = """
:root {
  --background: #f6f3ec;
  --surface: #ffffff;
  --surface-muted: #e9edf0;
  --ink: #171c1f;
  --muted: #66727a;
  --line: #c8d0d4;
  --accent: #0f766e;
  --accent-strong: #0b4f49;
}

body,
.gradio-container {
  background: linear-gradient(180deg, #f6f3ec 0, #eef3f1 42%, #f6f3ec 100%) !important;
  color: var(--ink) !important;
}

.gradio-container {
  max-width: none !important;
  padding: 28px !important;
}

.hero-band {
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin: 0 auto 24px;
  max-width: 1440px;
}

.eyebrow {
  color: var(--accent-strong);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  margin: 0 0 8px;
  text-transform: uppercase;
}

h1 {
  color: var(--ink);
  font-size: clamp(2rem, 4vw, 4.6rem);
  line-height: 0.98;
  margin: 0;
  max-width: 820px;
}

.workspace {
  gap: 18px !important;
  margin: 0 auto !important;
  max-width: 1440px !important;
}

.preview-panel {
  background: #111619;
  border: 1px solid rgba(23, 28, 31, 0.18);
  border-radius: 8px;
  box-shadow: 0 22px 50px rgba(23, 28, 31, 0.12);
  min-height: 58vh;
  overflow: hidden;
  padding: 18px;
}

.preview-panel .block,
.control-panel .block {
  border-radius: 8px !important;
}

.upload-box,
.detected-box {
  background: #111619 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.control-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 22px 50px rgba(23, 28, 31, 0.12);
  gap: 16px;
  padding: 18px;
}

.status-line {
  color: var(--muted);
  font-weight: 700;
}

button.primary,
.primary {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: #ffffff !important;
}

.zip-download {
  background: #d7efea !important;
}

.zip-button {
  width: 100% !important;
}

.frames-section {
  margin: 28px auto 0 !important;
  max-width: 1440px !important;
}

.section-head h2 {
  color: var(--ink);
  font-size: 1.35rem;
  margin: 0 0 14px;
}

.frame-gallery {
  background: transparent !important;
  border: 0 !important;
}

@media (max-width: 980px) {
  .gradio-container {
    padding: 18px !important;
  }
}
"""


if __name__ == "__main__":
    launch_app()
