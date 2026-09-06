#!/usr/bin/env python3
"""Convert the raw AFL2026DraftKit.xlsx export into src/data/draftkit-2026.json.

The source workbook packs each player into 4 rows (headshot/xrank/adp/points,
name, position, team) with an occasional single-row "Tier N" marker between
tier groups. This script flattens that into one JSON object per player.

Run with: python3 scripts/build-draftkit.py
Requires: pip install openpyxl
"""
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("Missing dependency: pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "src" / "data" / "AFL2026DraftKit.xlsx"
DEST = ROOT / "src" / "data" / "draftkit-2026.json"

TIER_RE = re.compile(r"^Tier\s+(\d+)$", re.IGNORECASE)


def as_number(value):
    """Coerce a cell value to a number, or None for blanks/placeholders like '-'."""
    if isinstance(value, (int, float)):
        return value
    return None


def main():
    wb = openpyxl.load_workbook(SOURCE, data_only=True)
    ws = wb.worksheets[0]

    rows = [
        [ws.cell(row=r, column=c).value for c in range(1, 5)]
        for r in range(2, ws.max_row + 1)  # skip header row
    ]

    players = []
    tier = 0
    i = 0
    while i < len(rows):
        row = rows[i]
        first_cell = row[0]

        tier_match = TIER_RE.match(str(first_cell)) if first_cell else None
        if tier_match:
            tier = int(tier_match.group(1))
            i += 1
            continue

        # Expect a 4-row player block: [stats], [name], [position], [team]
        if i + 3 >= len(rows):
            break
        stats_row, name_row, pos_row, team_row = rows[i : i + 4]
        players.append(
            {
                "name": name_row[0],
                "position": pos_row[0],
                "team": team_row[0],
                "xrank": as_number(stats_row[1]),
                "adp": as_number(stats_row[2]),
                "projPts": as_number(stats_row[3]) or 0,
                "tier": tier,
            }
        )
        i += 4

    players.sort(key=lambda p: p["xrank"] if p["xrank"] is not None else float("inf"))
    DEST.write_text(json.dumps(players, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(players)} players to {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
