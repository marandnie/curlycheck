#!/usr/bin/env python3
"""
build-inci-catalog.py
=====================
Descarga la base oficial CosIng (Comisión Europea) y la taxonomía abierta de
Open Beauty Facts, las fusiona y genera dos artefactos pensados para la PWA:

    src/data/inci-catalog.json    -> Catálogo completo con CAS, función y sinónimos
    src/data/inci-names.json      -> Solo nombres canónicos (lookup rápido)

Fuentes:
    - CosIng v2 (snapshot 2020-12-15 vía web.archive.org). El endpoint vivo de
      ec.europa.eu sigue publicado pero ahora devuelve HTML; Wayback conserva
      el CSV real con ~30.500 entradas.
    - Open Beauty Facts ingredients taxonomy (refrescada semanalmente). Aporta
      sinónimos en es/en/fr/it, útiles para el OCR cuando una etiqueta dice
      "Aqua" y otra "Water".

Uso:
    python3 scripts/build-inci-catalog.py [--out src/data]

Sin dependencias externas — solo stdlib. Tarda ~30s.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Iterable

COSING_URL = (
    "https://web.archive.org/web/20201230181855if_/"
    "https://ec.europa.eu/growth/tools-databases/cosing/pdf/"
    "COSING_Ingredients-Fragrance%20Inventory_v2.csv"
)
OBF_TAXONOMY_URL = "https://static.openbeautyfacts.org/data/taxonomies/ingredients.json"

UA = "CurlyCheck/1.0 (+https://github.com/mandieto/curlycheck) inci-catalog-builder"


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def fetch(url: str) -> bytes:
    """Descarga binaria con User-Agent identificable."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def normalize_inci(name: str) -> str:
    """CosIng publica los INCI en MAYÚSCULAS con espacios sobrantes. Lo dejamos
    en Title Case respetando convenciones (números, guiones, paréntesis)."""
    if not name:
        return ""
    name = re.sub(r"\s+", " ", name).strip()

    def cap(word: str) -> str:
        if not word:
            return word
        if any(c.isdigit() for c in word):
            return word  # PEG-12, C14-16, etc.
        return word[0].upper() + word[1:].lower()

    parts = re.split(r"(\s|/|-)", name)
    return "".join(cap(p) if p.strip() and p not in {"/", "-"} else p for p in parts)


def split_multi(value: str) -> list[str]:
    """CAS/EC vienen mezclados con `, ` o ` / ` como separadores. Devuelve
    lista limpia, descartando guiones huérfanos que CosIng usa como
    placeholders cuando una sustancia tiene varios CAS pero no todos los EC."""
    if not value:
        return []
    out = []
    for chunk in re.split(r"\s*[,;/]\s*", value):
        chunk = chunk.strip()
        if chunk and chunk not in {"-", "—"}:
            out.append(chunk)
    return out


def split_functions(value: str) -> list[str]:
    """CosIng usa `FUNCTION1 / FUNCTION2 / FUNCTION3`."""
    if not value:
        return []
    parts = [p.strip() for p in re.split(r"[/,]", value) if p.strip()]
    return [normalize_inci(p) for p in parts]


# --------------------------------------------------------------------------- #
# CosIng
# --------------------------------------------------------------------------- #

def parse_cosing(raw: bytes) -> dict[str, dict]:
    """Devuelve dict { inci_normalizado: { ref, cas, ec, function, restriction } }."""
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines()
    header_idx = next(
        (i for i, l in enumerate(lines) if l.startswith("COSING Ref No,")),
        None,
    )
    if header_idx is None:
        raise RuntimeError("No encontré la cabecera de CosIng en el CSV")

    reader = csv.DictReader(io.StringIO("\n".join(lines[header_idx:])))
    catalog: dict[str, dict] = {}
    for row in reader:
        inci_raw = (row.get("INCI name") or "").strip()
        if not inci_raw:
            continue
        canonical = normalize_inci(inci_raw)
        if not canonical:
            continue
        catalog[canonical] = {
            "ref": (row.get("COSING Ref No") or "").strip(),
            "cas": split_multi(row.get("CAS No") or ""),
            "ec": split_multi(row.get("EC No") or ""),
            "function": split_functions(row.get("Function") or ""),
            "restriction": (row.get("Restriction") or "").strip() or None,
            "description": (row.get("Chem/IUPAC Name / Description") or "").strip() or None,
            "updated": (row.get("Update Date") or "").strip() or None,
        }
    return catalog


# --------------------------------------------------------------------------- #
# Open Beauty Facts
# --------------------------------------------------------------------------- #

def parse_obf_synonyms(raw: bytes) -> dict[str, list[str]]:
    """Devuelve dict { inci_normalizado: [sinónimos...] } usando OBF.

    OBF estructura las entradas como `xx:Nombre` (xx = código de idioma) y
    guarda los sinónimos por idioma. Para CurlyCheck nos interesan es/en y, de
    forma secundaria, fr/it/pt para etiquetas multi-idioma.
    """
    data = json.loads(raw.decode("utf-8", errors="replace"))
    langs = ("en", "es", "fr", "it", "pt", "de")
    synonyms: dict[str, list[str]] = {}
    for entry in data.values():
        names = entry.get("name", {}) or {}
        pivot = names.get("en")
        if not pivot:
            continue
        canonical = normalize_inci(pivot)
        if not canonical:
            continue
        bag: set[str] = set()
        for lang in langs:
            n = names.get(lang)
            if n and n.lower() != pivot.lower():
                bag.add(n.strip())
        syn_block = entry.get("synonyms", {}) or {}
        for lang in langs:
            for s in syn_block.get(lang, []) or []:
                s = s.strip()
                if s and s.lower() != pivot.lower():
                    bag.add(s)
        if bag:
            synonyms[canonical] = sorted(bag)
    return synonyms


# --------------------------------------------------------------------------- #
# Build
# --------------------------------------------------------------------------- #

def build(out_dir: Path) -> None:
    print("[1/4] Descargando CosIng… ", end="", flush=True)
    cosing_bytes = fetch(COSING_URL)
    print(f"{len(cosing_bytes) / 1024:.1f} KB")

    print("[2/4] Descargando OBF taxonomy… ", end="", flush=True)
    obf_bytes = fetch(OBF_TAXONOMY_URL)
    print(f"{len(obf_bytes) / 1024:.1f} KB")

    print("[3/4] Parseando y normalizando…")
    cosing = parse_cosing(cosing_bytes)
    obf = parse_obf_synonyms(obf_bytes)

    merged = []
    for inci, payload in sorted(cosing.items()):
        record = {"inci": inci, **payload}
        syns = obf.get(inci)
        if syns:
            record["synonyms"] = syns
        merged.append({k: v for k, v in record.items() if v not in (None, [], "")})

    extra = 0
    cosing_keys = set(cosing.keys())
    for inci, syns in obf.items():
        if inci not in cosing_keys:
            merged.append({"inci": inci, "synonyms": syns, "source": "obf"})
            extra += 1

    merged.sort(key=lambda r: r["inci"])

    out_dir.mkdir(parents=True, exist_ok=True)
    full_path = out_dir / "inci-catalog.json"
    names_path = out_dir / "inci-names.json"

    full_payload = {
        "version": "2026-05-16",
        "sources": {
            "cosing": "EU CosIng v2 snapshot 2020-12-15 (vía web.archive.org)",
            "obf": "Open Beauty Facts ingredients taxonomy (live)",
        },
        "count": len(merged),
        "ingredients": merged,
    }
    full_path.write_text(
        json.dumps(full_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    names_path.write_text(
        json.dumps(
            sorted({r["inci"] for r in merged}),
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    print("[4/4] Listo.")
    print(f"  - {full_path}  ({full_path.stat().st_size / 1024:.0f} KB, {len(merged)} ingredientes)")
    print(f"  - {names_path}  ({names_path.stat().st_size / 1024:.0f} KB)")
    print(f"  - CosIng: {len(cosing)} | OBF extras: {extra}")


# --------------------------------------------------------------------------- #

def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Construye el catálogo INCI para CurlyCheck.")
    parser.add_argument(
        "--out",
        default="src/data",
        help="Directorio de salida (default: src/data, relativo al cwd).",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    out_dir = Path(args.out)
    try:
        build(out_dir)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
