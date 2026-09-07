"""Build the game's WOFF2 subset from the pinned Noto Serif CJK JP Bold OTF.

Requires fonttools[woff]. See assets/fonts/README.md for download and usage.
"""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = "861a2b2c0e24b23745c262be8c3fdef63f12628f0492fb120ee51aa55c503af8"

if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/subset-kanji-font.py NotoSerifCJKjp-Bold.otf")
source = Path(sys.argv[1])
if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
    raise SystemExit("Unexpected source font. Download the version in assets/fonts/README.md.")

glyphs = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    'import { OPENING_KANJI, O_KANJI } from "./breath.js";'
    'import { CONFIG, TRAINING_CONFIG } from "./config.js";'
    'console.log(JSON.stringify([...OPENING_KANJI, ...O_KANJI, CONFIG.finalKanji, TRAINING_CONFIG.finalKanji]));',
], cwd=ROOT, text=True))
codepoints = {ord(char) for glyph in glyphs for char in glyph}
font = TTFont(source, recalcTimestamp=False)
missing = codepoints - font.getBestCmap().keys()
if missing:
    raise SystemExit("Source font is missing: " + "".join(chr(cp) for cp in sorted(missing)))

options = subset.Options()
options.name_IDs = ["*"]  # Preserve copyright, attribution, and license metadata.
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(font)

# Give this modified, limited-coverage derivative its own family name.
names = {
    1: "Dojo Kanji", 2: "Bold", 3: "Dojo Kanji Bold 2.003 subset",
    4: "Dojo Kanji Bold", 6: "DojoKanji-Bold", 16: "Dojo Kanji", 17: "Bold",
}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
cff = font["CFF "].cff
cff.fontNames = ["DojoKanji-Bold"]
cff.topDictIndex[0].FamilyName = "Dojo Kanji"
cff.topDictIndex[0].FullName = "Dojo Kanji Bold"

font.flavor = "woff2"
output = ROOT / "assets/fonts/dojo-kanji.woff2"
output.parent.mkdir(parents=True, exist_ok=True)
font.save(output)
with TTFont(output) as saved:
    if codepoints - saved.getBestCmap().keys():
        raise SystemExit("Subset lost required glyphs.")
revision = hashlib.sha256(output.read_bytes()).hexdigest()[:12]
for name in ["styles.css", "index.html"]:
    document = ROOT / name
    contents, replacements = re.subn(
        r'(\./assets/fonts/dojo-kanji\.woff2)(?:\?v=[a-f0-9]+)?',
        lambda match: match[1] + "?v=" + revision,
        document.read_text(),
    )
    if replacements != 1:
        raise SystemExit(f"Expected exactly one game font URL in {name}.")
    document.write_text(contents)
print(f"Created {output.relative_to(ROOT)}: {len(codepoints)} characters, {output.stat().st_size} bytes")
