"use client";

/* eslint-disable @next/next/no-img-element */

import JSZip from "jszip";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  detectGridRegions,
  type DetectionSettings,
  type FrameRegion,
  type SeparatorMode,
} from "@/lib/grid-detection";

type OutputFormat = "image/jpeg" | "image/png" | "image/webp";

type ExtractedFrame = FrameRegion & {
  blob: Blob;
  url: string;
  fileName: string;
};

type SourceImage = {
  file: File;
  url: string;
  width: number;
  height: number;
};

const defaultSettings: DetectionSettings = {
  minFrameSize: 80,
  separatorMode: "auto",
  sensitivity: 58,
};

const maxAnalysisSide = 1800;

export function GridExtractor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const framesRef = useRef<ExtractedFrame[]>([]);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [settings, setSettings] = useState<DetectionSettings>(defaultSettings);
  const [format, setFormat] = useState<OutputFormat>("image/jpeg");
  const [regions, setRegions] = useState<FrameRegion[]>([]);
  const [frames, setFramesState] = useState<ExtractedFrame[]>([]);
  const [engine, setEngine] = useState("Idle");
  const [status, setStatus] = useState("No image loaded");
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      revokeFrames(framesRef.current);
    };
  }, []);

  const baseName = useMemo(() => {
    if (!source?.file.name) return "grid";
    return source.file.name.replace(/\.[^/.]+$/, "").replace(/[^\w-]+/g, "-");
  }, [source]);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Select an image file.");
      return;
    }

    setError(null);
    setStatus("Loading image");
    setEngine("Loading");
    setRegions([]);
    replaceFrames([]);

    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const url = URL.createObjectURL(file);
    sourceUrlRef.current = url;

    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      setSource({ file, url, width: bitmap.width, height: bitmap.height });
      bitmap.close();
      await extractFrames(file, url);
    } catch (loadError) {
      URL.revokeObjectURL(url);
      sourceUrlRef.current = null;
      setSource(null);
      setError(toErrorMessage(loadError));
      setEngine("Idle");
      setStatus("Image could not be loaded");
    }
  }

  async function extractFrames(file = source?.file, fallbackUrl = source?.url) {
    if (!file) return;

    setError(null);
    setIsExtracting(true);
    setZipProgress(0);
    setEngine("Python/OpenCV");
    setStatus("Detecting grid with Python");
    replaceFrames([]);

    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      const result = await detectRegions(file, bitmap, settings);
      setEngine(result.engine === "python-opencv" ? "Python/OpenCV" : "Browser fallback");

      setRegions(result.regions);

      if (result.regions.length === 0) {
        setStatus("No frames detected");
        setError("No frames were detected. Raise sensitivity or lower minimum size.");
        return;
      }

      setStatus(`Cropping ${result.regions.length} frames`);
      const nextFrames = await cropRegions(
        bitmap,
        result.regions,
        fileBaseName(file),
        format,
      );
      replaceFrames(nextFrames);
      setStatus(
        `${nextFrames.length} frames extracted from ${result.columns} columns x ${result.rows} rows`,
      );
    } catch (extractError) {
      setError(toErrorMessage(extractError));
      setEngine("Failed");
      setStatus("Extraction failed");
      if (fallbackUrl) setSource((current) => current && { ...current, url: fallbackUrl });
    } finally {
      bitmap?.close();
      setIsExtracting(false);
    }
  }

  async function downloadAll() {
    if (frames.length === 0) return;

    setIsZipping(true);
    setZipProgress(0);
    setStatus("Building ZIP");

    try {
      const zip = new JSZip();
      for (const frame of frames) {
        zip.file(frame.fileName, frame.blob);
      }

      const blob = await zip.generateAsync({ type: "blob" }, (metadata) => {
        setZipProgress(Math.round(metadata.percent));
      });

      downloadBlob(blob, `${baseName || "grid"}-frames.zip`);
      setStatus(`ZIP ready with ${frames.length} frames`);
    } catch (zipError) {
      setError(toErrorMessage(zipError));
      setStatus("ZIP failed");
    } finally {
      setIsZipping(false);
    }
  }

  function replaceFrames(nextFrames: ExtractedFrame[]) {
    revokeFrames(framesRef.current);
    framesRef.current = nextFrames;
    setFramesState(nextFrames);
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div>
          <p className="eyebrow">Grid2Frame</p>
          <h1>Extract every frame from a grid image.</h1>
        </div>
        <div className="actions">
          <button
            className="button button-primary"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <UploadIcon />
            Upload grid
          </button>
          <button
            className="button"
            disabled={!source || isExtracting}
            onClick={() => void extractFrames()}
            type="button"
          >
            <ScanIcon />
            Extract
          </button>
        </div>
      </section>

      <section className="workspace">
        <div
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
        >
          <input
            ref={inputRef}
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = "";
            }}
            type="file"
          />

          {source ? (
            <div className="preview-wrap">
              <div
                className="image-stage"
                style={{ "--ratio": source.width / source.height } as CSSProperties}
              >
                <img alt="Uploaded grid preview" className="source-preview" src={source.url} />
                <div aria-hidden="true" className="region-layer">
                  {regions.map((region) => (
                    <span
                      className="region-box"
                      key={region.id}
                      style={{
                        height: `${(region.height / source.height) * 100}%`,
                        left: `${(region.x / source.width) * 100}%`,
                        top: `${(region.y / source.height) * 100}%`,
                        width: `${(region.width / source.width) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button
              className="empty-state"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <ImageIcon />
              <span>Drop image or browse</span>
              <small>JPG, PNG, WebP</small>
            </button>
          )}
        </div>

        <aside className="control-panel">
          <div className="status-line">
            <span className={isExtracting || isZipping ? "pulse-dot" : "dot"} />
            <span>{isZipping ? `${status} ${zipProgress}%` : status}</span>
          </div>

          {source && (
            <dl className="meta-grid">
              <div>
                <dt>Source</dt>
                <dd>{source.width.toLocaleString()} x {source.height.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Frames</dt>
                <dd>{frames.length}</dd>
              </div>
              <div>
                <dt>Engine</dt>
                <dd>{engine}</dd>
              </div>
            </dl>
          )}

          {error && <p className="error-text">{error}</p>}

          <label className="field">
            <span>Sensitivity</span>
            <input
              max="100"
              min="0"
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  sensitivity: Number(event.target.value),
                }))
              }
              type="range"
              value={settings.sensitivity}
            />
            <output>{settings.sensitivity}</output>
          </label>

          <label className="field">
            <span>Minimum frame</span>
            <input
              max="600"
              min="16"
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  minFrameSize: Number(event.target.value),
                }))
              }
              step="4"
              type="range"
              value={settings.minFrameSize}
            />
            <output>{settings.minFrameSize}px</output>
          </label>

          <div className="field">
            <span>Separator</span>
            <div className="segmented" role="group">
              {(["auto", "dark", "light"] as SeparatorMode[]).map((mode) => (
                <button
                  aria-pressed={settings.separatorMode === mode}
                  key={mode}
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      separatorMode: mode,
                    }))
                  }
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Output</span>
            <div className="segmented" role="group">
              {(["image/jpeg", "image/png", "image/webp"] as OutputFormat[]).map(
                (mimeType) => (
                  <button
                    aria-pressed={format === mimeType}
                    key={mimeType}
                    onClick={() => setFormat(mimeType)}
                    type="button"
                  >
                    {formatLabel(mimeType)}
                  </button>
                ),
              )}
            </div>
          </div>

          <button
            className="button button-primary button-wide"
            disabled={frames.length === 0 || isZipping}
            onClick={() => void downloadAll()}
            type="button"
          >
            <ArchiveIcon />
            Download ZIP
          </button>
        </aside>
      </section>

      {frames.length > 0 && (
        <section className="frames-section">
          <div className="section-head">
            <h2>Extracted frames</h2>
            <span>{frames.length} files</span>
          </div>
          <div className="frame-grid">
            {frames.map((frame, index) => (
              <article className="frame-card" key={frame.url}>
                <img alt={`Extracted frame ${index + 1}`} src={frame.url} />
                <div className="frame-info">
                  <div>
                    <strong>{String(index + 1).padStart(2, "0")}</strong>
                    <span>{frame.width} x {frame.height}</span>
                  </div>
                  <button
                    aria-label={`Download ${frame.fileName}`}
                    className="icon-button"
                    onClick={() => downloadBlob(frame.blob, frame.fileName)}
                    title="Download frame"
                    type="button"
                  >
                    <DownloadIcon />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

async function detectRegions(
  file: File,
  bitmap: ImageBitmap,
  settings: DetectionSettings,
) {
  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("minFrameSize", String(settings.minFrameSize));
    formData.append("separatorMode", settings.separatorMode);
    formData.append("sensitivity", String(settings.sensitivity));

    const response = await fetch("/api/extract", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as
      | {
          regions: FrameRegion[];
          rows: number;
          columns: number;
          engine: string;
        }
      | { error: string };

    if (!response.ok || "error" in payload) {
      throw new Error("error" in payload ? payload.error : "Python extraction failed.");
    }

    return payload;
  } catch {
    const analysis = buildAnalysisImageData(bitmap);
    return {
      ...detectGridRegions({
        imageData: analysis.imageData,
        originalWidth: bitmap.width,
        originalHeight: bitmap.height,
        settings,
      }),
      engine: "browser-fallback",
    };
  }
}

function buildAnalysisImageData(bitmap: ImageBitmap) {
  const scale = Math.min(1, maxAnalysisSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = getCanvasContext(canvas);
  context.drawImage(bitmap, 0, 0, width, height);

  return {
    imageData: context.getImageData(0, 0, width, height),
    scale,
  };
}

async function cropRegions(
  bitmap: ImageBitmap,
  regions: FrameRegion[],
  baseName: string,
  format: OutputFormat,
) {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const extension = extensionForFormat(format);
  const frames: ExtractedFrame[] = [];

  for (const region of regions) {
    canvas.width = region.width;
    canvas.height = region.height;
    context.clearRect(0, 0, region.width, region.height);
    context.drawImage(
      bitmap,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height,
    );

    const blob = await canvasToBlob(canvas, format, format === "image/jpeg" ? 0.94 : 0.98);
    const fileName = `${baseName || "grid"}-r${String(region.row + 1).padStart(2, "0")}-c${String(region.col + 1).padStart(2, "0")}.${extension}`;
    frames.push({
      ...region,
      blob,
      fileName,
      url: URL.createObjectURL(blob),
    });
  }

  return frames;
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Canvas is unavailable in this browser.");
  }

  return context;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: OutputFormat,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not render extracted frame."));
      },
      type,
      quality,
    );
  });
}

function revokeFrames(frames: ExtractedFrame[]) {
  for (const frame of frames) {
    URL.revokeObjectURL(frame.url);
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function fileBaseName(file: File) {
  return file.name.replace(/\.[^/.]+$/, "").replace(/[^\w-]+/g, "-");
}

function formatLabel(type: OutputFormat) {
  if (type === "image/png") return "PNG";
  if (type === "image/webp") return "WebP";
  return "JPG";
}

function extensionForFormat(type: OutputFormat) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3 7.5 7.5l1.4 1.4 2.1-2.08V16h2V6.82l2.1 2.08 1.4-1.4L12 3Z" />
      <path d="M5 15h2v3h10v-3h2v5H5v-5Z" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4h5v2H7v3H5V4Zm9 0h5v5h-2V6h-3V4ZM5 15h2v3h3v2H5v-5Zm12 3v-3h2v5h-5v-2h3ZM8 9h8v6H8V9Zm2 2v2h4v-2h-4Z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 5h16v14H4V5Zm2 2v8.6l3.5-3.5 2.5 2.5 4-4 2 2V7H6Zm0 10h12.6L16 14.4l-4 4-2.5-2.5L6 19.4V17Z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 4h16v5H4V4Zm2 2v1h12V6H6Zm0 5h12v9H6v-9Zm5 2v2h2v-2h-2Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M11 4h2v8.18l2.1-2.08 1.4 1.4L12 16l-4.5-4.5 1.4-1.4 2.1 2.08V4Z" />
      <path d="M5 18h14v2H5v-2Z" />
    </svg>
  );
}
