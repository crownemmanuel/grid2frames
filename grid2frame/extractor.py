from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class FrameRegion:
    id: str
    row: int
    col: int
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class DetectionResult:
    regions: list[FrameRegion]
    rows: int
    columns: int
    width: int
    height: int


@dataclass
class Band:
    start: int
    end: int


@dataclass(frozen=True)
class Segment:
    start: int
    end: int


def read_image(path: str | Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(Path(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    return image


def detect_grid(
    image: np.ndarray,
    min_frame_size: int = 80,
    sensitivity: int = 58,
    separator_mode: str = "auto",
) -> DetectionResult:
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    vertical_bands = find_separator_bands(
        gray=gray,
        axis="vertical",
        min_frame_size=min_frame_size,
        sensitivity=sensitivity,
        separator_mode=separator_mode,
    )
    horizontal_bands = find_separator_bands(
        gray=gray,
        axis="horizontal",
        min_frame_size=min_frame_size,
        sensitivity=sensitivity,
        separator_mode=separator_mode,
    )

    x_segments = bands_to_segments(vertical_bands, width, min_frame_size)
    y_segments = bands_to_segments(horizontal_bands, height, min_frame_size)
    regions: list[FrameRegion] = []

    for row, y_segment in enumerate(y_segments):
        for col, x_segment in enumerate(x_segments):
            regions.append(
                FrameRegion(
                    id=f"{row + 1}-{col + 1}",
                    row=row,
                    col=col,
                    x=x_segment.start,
                    y=y_segment.start,
                    width=x_segment.end - x_segment.start,
                    height=y_segment.end - y_segment.start,
                )
            )

    return DetectionResult(
        regions=regions,
        rows=len(y_segments),
        columns=len(x_segments),
        width=width,
        height=height,
    )


def extract_frames(image: np.ndarray, regions: list[FrameRegion]) -> list[np.ndarray]:
    frames = []
    for region in regions:
        frames.append(
            image[
                region.y : region.y + region.height,
                region.x : region.x + region.width,
            ].copy()
        )
    return frames


def annotate_regions(image: np.ndarray, regions: list[FrameRegion]) -> np.ndarray:
    annotated = image.copy()
    color = (190, 255, 55)

    for region in regions:
        cv2.rectangle(
            annotated,
            (region.x, region.y),
            (region.x + region.width, region.y + region.height),
            color,
            max(1, round(max(image.shape[:2]) / 700)),
        )

    return annotated


def find_separator_bands(
    gray: np.ndarray,
    axis: str,
    min_frame_size: int,
    sensitivity: int,
    separator_mode: str,
) -> list[Band]:
    sensitivity = max(0, min(100, sensitivity))
    dark_threshold = 10 + round(sensitivity * 0.24)
    light_threshold = 246 - round(sensitivity * 0.16)
    line_ratio_threshold = 0.972 - sensitivity * 0.00035

    if separator_mode == "dark":
        separator_mask = gray <= dark_threshold
    elif separator_mode == "light":
        separator_mask = gray >= light_threshold
    else:
        separator_mask = (gray <= dark_threshold) | (gray >= light_threshold)

    if axis == "vertical":
        profile = separator_mask.mean(axis=0)
        axis_size = gray.shape[1]
    else:
        profile = separator_mask.mean(axis=1)
        axis_size = gray.shape[0]

    candidate_indexes = np.flatnonzero(profile >= line_ratio_threshold)
    bands = group_indexes(candidate_indexes)
    max_thickness = max(2, min(round(axis_size * 0.018), round(min_frame_size * 0.35)))
    bands = [band for band in bands if band.end - band.start + 1 <= max_thickness]

    return merge_close_bands(bands, min_gap=max(2, round(min_frame_size * 0.08)))


def group_indexes(indexes: np.ndarray) -> list[Band]:
    if indexes.size == 0:
        return []

    bands: list[Band] = []
    start = int(indexes[0])
    previous = int(indexes[0])

    for raw_index in indexes[1:]:
        index = int(raw_index)
        if index <= previous + 2:
            previous = index
            continue

        bands.append(Band(start=start, end=previous))
        start = index
        previous = index

    bands.append(Band(start=start, end=previous))
    return bands


def merge_close_bands(bands: list[Band], min_gap: int) -> list[Band]:
    if not bands:
        return []

    merged = [bands[0]]
    for band in bands[1:]:
        current = merged[-1]
        if band.start - current.end <= min_gap:
            current.end = band.end
        else:
            merged.append(band)

    return merged


def bands_to_segments(bands: list[Band], axis_size: int, min_frame_size: int) -> list[Segment]:
    if not bands:
        return [Segment(start=0, end=axis_size)]

    edge_tolerance = max(3, round(axis_size * 0.008))
    first_pixel = 0
    last_pixel = axis_size
    internal_bands: list[Band] = []

    for band in bands:
        if band.start <= edge_tolerance:
            first_pixel = max(first_pixel, band.end + 1)
        elif band.end >= axis_size - edge_tolerance - 1:
            last_pixel = min(last_pixel, band.start)
        else:
            internal_bands.append(band)

    segments: list[Segment] = []
    segment_start = first_pixel

    for band in internal_bands:
        push_segment(segments, segment_start, band.start, min_frame_size)
        segment_start = band.end + 1

    push_segment(segments, segment_start, last_pixel, min_frame_size)
    return segments


def push_segment(segments: list[Segment], start: int, end: int, min_frame_size: int) -> None:
    start = max(0, int(round(start)))
    end = max(start, int(round(end)))

    if end - start >= min_frame_size:
        segments.append(Segment(start=start, end=end))
