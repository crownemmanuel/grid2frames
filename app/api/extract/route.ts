import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";

type PythonResult = {
  regions: Array<{
    id: string;
    row: number;
    col: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  rows: number;
  columns: number;
  width: number;
  height: number;
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing image file." }, { status: 400 });
  }

  const tempDirectory = path.join(
    tmpdir(),
    `grid2frame-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const tempFile = path.join(tempDirectory, sanitizeFileName(file.name));

  try {
    await mkdir(tempDirectory, { recursive: true });
    await writeFile(tempFile, Buffer.from(await file.arrayBuffer()));

    const result = await runPythonDetector(tempFile, {
      minFrameSize: String(formData.get("minFrameSize") ?? "80"),
      separatorMode: String(formData.get("separatorMode") ?? "auto"),
      sensitivity: String(formData.get("sensitivity") ?? "58"),
    });

    return Response.json({ ...result, engine: "python-opencv" });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Extraction failed." },
      { status: 500 },
    );
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function runPythonDetector(
  imagePath: string,
  options: {
    minFrameSize: string;
    separatorMode: string;
    sensitivity: string;
  },
) {
  return new Promise<PythonResult>((resolve, reject) => {
    const projectRoot = process.cwd();
    const virtualEnvPython = [
      projectRoot,
      ".venv",
      "bin",
      "python3",
    ].join(path.sep);
    const pythonPath =
      process.env.PYTHON_BIN ??
      (existsSync(virtualEnvPython) ? virtualEnvPython : "python3");
    const scriptPath = path.join(projectRoot, "scripts", "extract_grid.py");
    const child = spawn(
      pythonPath,
      [
        scriptPath,
        imagePath,
        "--min-frame-size",
        options.minFrameSize,
        "--separator-mode",
        options.separatorMode,
        "--sensitivity",
        options.sensitivity,
      ],
      { cwd: projectRoot },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as PythonResult);
      } catch {
        reject(new Error("Python returned invalid JSON."));
      }
    });
  });
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.replace(/[^\w.-]+/g, "-");
  return normalized || "upload";
}
