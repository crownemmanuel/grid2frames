#!/usr/bin/env python3
import argparse
from dataclasses import asdict
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from grid2frame.extractor import detect_grid, read_image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Detect frame regions in a grid image.")
    parser.add_argument("image", type=Path)
    parser.add_argument("--min-frame-size", type=int, default=80)
    parser.add_argument("--separator-mode", choices=["auto", "dark", "light"], default="auto")
    parser.add_argument("--sensitivity", type=int, default=58)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    image = read_image(args.image)
    result = detect_grid(
        image,
        min_frame_size=args.min_frame_size,
        separator_mode=args.separator_mode,
        sensitivity=args.sensitivity,
    )
    print(json.dumps(asdict(result)))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
