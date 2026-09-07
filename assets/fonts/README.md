# Dojo Kanji

`dojo-kanji.woff2` is a renamed subset of **Noto Serif CJK JP Bold 2.003**. It contains the game's opening characters, candidate pool, and the reward characters for both courses, including 依・田・芳・乃. Serving this file with the site keeps uncommon kanji in the same typeface across devices without a third-party font request.

- Upstream: [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk/tree/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif).
- Source: `Serif/OTF/Japanese/NotoSerifCJKjp-Bold.otf` at commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c`.
- Source SHA-256: `861a2b2c0e24b23745c262be8c3fdef63f12628f0492fb120ee51aa55c503af8`.
- Copyright: © 2017–2024 Adobe (http://www.adobe.com/).
- License: [SIL Open Font License 1.1](OFL.txt). Copyright and license metadata are also retained in the font.
- Modifications: character subsetting, WOFF2 compression, and renaming to **Dojo Kanji**. Glyph outlines are unchanged.

## Regenerate after changing the character pool

The generated font is committed; normal development and deployment do not need Python. To update the subset, run these commands from the repository root with Python 3 and Node.js installed:

```sh
python3 -m venv .test-artifacts/font-tools
.test-artifacts/font-tools/bin/pip install 'fonttools[woff]'
curl -fL https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Serif/OTF/Japanese/NotoSerifCJKjp-Bold.otf -o .test-artifacts/NotoSerifCJKjp-Bold.otf
.test-artifacts/font-tools/bin/python scripts/subset-kanji-font.py .test-artifacts/NotoSerifCJKjp-Bold.otf
npm run test:layout -- --grep 'every game kanji'
```

The script verifies the source checksum, reads the current characters from `breath.js` and `config.js`, and fails if the source font lacks any required character. The browser test checks the font actually used to render every character, detecting fallback even when the declared CSS font family looks correct.
