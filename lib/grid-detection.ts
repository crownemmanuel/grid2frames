export type SeparatorMode = "auto" | "dark" | "light";

export type DetectionSettings = {
  minFrameSize: number;
  separatorMode: SeparatorMode;
  sensitivity: number;
};

export type Segment = {
  start: number;
  end: number;
};

export type FrameRegion = {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type AxisSample = {
  candidate: boolean;
  score: number;
};

type Band = {
  start: number;
  end: number;
};

type DetectGridInput = {
  imageData: ImageData;
  originalWidth: number;
  originalHeight: number;
  settings: DetectionSettings;
};

export function detectGridRegions({
  imageData,
  originalWidth,
  originalHeight,
  settings,
}: DetectGridInput) {
  const analysisWidth = imageData.width;
  const analysisHeight = imageData.height;
  const scaleX = analysisWidth / originalWidth;
  const scaleY = analysisHeight / originalHeight;

  const verticalBands = selectSeparatorBands(
    buildAxisProfile(imageData, "vertical", settings),
    analysisWidth,
    Math.max(3, Math.round(settings.minFrameSize * scaleX)),
  );
  const horizontalBands = selectSeparatorBands(
    buildAxisProfile(imageData, "horizontal", settings),
    analysisHeight,
    Math.max(3, Math.round(settings.minFrameSize * scaleY)),
  );

  const xSegments = bandsToSegments({
    bands: verticalBands,
    analysisSize: analysisWidth,
    originalSize: originalWidth,
    scale: scaleX,
    minFrameSize: settings.minFrameSize,
  });
  const ySegments = bandsToSegments({
    bands: horizontalBands,
    analysisSize: analysisHeight,
    originalSize: originalHeight,
    scale: scaleY,
    minFrameSize: settings.minFrameSize,
  });

  const regions = ySegments.flatMap((ySegment, row) =>
    xSegments.map((xSegment, col) => ({
      id: `${row + 1}-${col + 1}`,
      row,
      col,
      x: xSegment.start,
      y: ySegment.start,
      width: xSegment.end - xSegment.start,
      height: ySegment.end - ySegment.start,
    })),
  );

  return {
    regions,
    rows: ySegments.length,
    columns: xSegments.length,
    xSegments,
    ySegments,
  };
}

function buildAxisProfile(
  imageData: ImageData,
  axis: "vertical" | "horizontal",
  settings: DetectionSettings,
): AxisSample[] {
  const { data, width, height } = imageData;
  const axisSize = axis === "vertical" ? width : height;
  const crossSize = axis === "vertical" ? height : width;
  const crossStep = Math.max(1, Math.floor(crossSize / 900));
  const threshold = sensitivityToThreshold(settings.sensitivity);
  const edgeThreshold = Math.max(0.28, threshold * 0.74);

  return Array.from({ length: axisSize }, (_, axisIndex) => {
    let count = 0;
    let darkCount = 0;
    let lightCount = 0;
    let luminanceSum = 0;
    let luminanceSquareSum = 0;
    let edgeDiffSum = 0;

    for (let crossIndex = 0; crossIndex < crossSize; crossIndex += crossStep) {
      const x = axis === "vertical" ? axisIndex : crossIndex;
      const y = axis === "vertical" ? crossIndex : axisIndex;
      const offset = (y * width + x) * 4;
      const luminance =
        data[offset] * 0.2126 +
        data[offset + 1] * 0.7152 +
        data[offset + 2] * 0.0722;

      luminanceSum += luminance;
      luminanceSquareSum += luminance * luminance;
      if (luminance <= 42) darkCount += 1;
      if (luminance >= 218) lightCount += 1;

      if (axisIndex < axisSize - 1) {
        const nextX = axis === "vertical" ? axisIndex + 1 : crossIndex;
        const nextY = axis === "vertical" ? crossIndex : axisIndex + 1;
        const nextOffset = (nextY * width + nextX) * 4;
        const nextLuminance =
          data[nextOffset] * 0.2126 +
          data[nextOffset + 1] * 0.7152 +
          data[nextOffset + 2] * 0.0722;
        edgeDiffSum += Math.abs(luminance - nextLuminance);
      }

      count += 1;
    }

    const mean = luminanceSum / count;
    const variance = Math.max(0, luminanceSquareSum / count - mean * mean);
    const standardDeviation = Math.sqrt(variance);
    const uniformity = 1 - Math.min(standardDeviation / 64, 1);
    const darkRatio = darkCount / count;
    const lightRatio = lightCount / count;
    const extremeRatio =
      settings.separatorMode === "dark"
        ? darkRatio
        : settings.separatorMode === "light"
          ? lightRatio
          : Math.max(darkRatio, lightRatio);
    const separatorScore = uniformity * extremeRatio;
    const edgeScore =
      Math.min(edgeDiffSum / count / 34, 1) *
      Math.min(extremeRatio / 0.72, 1);
    const score = Math.max(
      edgeScore * 1.2,
      separatorScore * 0.68 + edgeScore * 0.38,
    );

    return {
      candidate:
        (separatorScore >= threshold &&
          uniformity >= 0.46 &&
          extremeRatio >= 0.5) ||
        (edgeScore >= edgeThreshold && extremeRatio >= 0.48),
      score,
    };
  });
}

function sensitivityToThreshold(sensitivity: number) {
  const normalized = clamp(sensitivity, 0, 100) / 100;
  return 0.68 - normalized * 0.34;
}

function selectSeparatorBands(
  profile: AxisSample[],
  axisSize: number,
  minFrameAnalysisSize: number,
) {
  const edgeZone = Math.max(2, Math.round(axisSize * 0.006));
  const candidates = profile
    .map((sample, index) => ({ index, ...sample }))
    .filter(({ candidate, index, score }) => {
      if (!candidate) return false;
      if (index <= edgeZone || index >= axisSize - edgeZone - 1) return true;

      const previous = profile[index - 1]?.score ?? 0;
      const next = profile[index + 1]?.score ?? 0;
      return score >= previous && score >= next;
    })
    .sort((a, b) => b.score - a.score);

  const selected: Array<{ index: number; score: number }> = [];
  const minGap = Math.max(4, Math.round(minFrameAnalysisSize * 0.84));

  for (const candidate of candidates) {
    const isEdge =
      candidate.index <= edgeZone || candidate.index >= axisSize - edgeZone - 1;
    const hasNearby = selected.some(
      (current) => Math.abs(current.index - candidate.index) < minGap,
    );

    if (isEdge || !hasNearby) {
      selected.push({ index: candidate.index, score: candidate.score });
    }
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .map(({ index }) => ({
      start: Math.max(0, index - 1),
      end: Math.min(axisSize - 1, index + 1),
    }));
}

function bandsToSegments({
  bands,
  analysisSize,
  originalSize,
  scale,
  minFrameSize,
}: {
  bands: Band[];
  analysisSize: number;
  originalSize: number;
  scale: number;
  minFrameSize: number;
}) {
  const edgeTolerance = Math.max(2, Math.round(analysisSize * 0.006));
  let firstPixel = 0;
  let lastPixel = originalSize;
  const internalBands: Band[] = [];

  for (const band of bands) {
    if (band.start <= edgeTolerance) {
      firstPixel = Math.max(firstPixel, Math.ceil((band.end + 1) / scale));
      continue;
    }

    if (band.end >= analysisSize - edgeTolerance - 1) {
      lastPixel = Math.min(lastPixel, Math.floor(band.start / scale));
      continue;
    }

    internalBands.push(band);
  }

  const segments: Segment[] = [];
  let segmentStart = firstPixel;

  for (const band of internalBands) {
    const segmentEnd = Math.floor(band.start / scale);
    pushSegment(segments, segmentStart, segmentEnd, minFrameSize);
    segmentStart = Math.ceil((band.end + 1) / scale);
  }

  pushSegment(segments, segmentStart, lastPixel, minFrameSize);

  return segments;
}

function pushSegment(
  segments: Segment[],
  start: number,
  end: number,
  minFrameSize: number,
) {
  const normalizedStart = Math.max(0, Math.round(start));
  const normalizedEnd = Math.max(normalizedStart, Math.round(end));

  if (normalizedEnd - normalizedStart >= minFrameSize) {
    segments.push({
      start: normalizedStart,
      end: normalizedEnd,
    });
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
