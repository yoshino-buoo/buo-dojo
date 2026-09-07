import { isYoshinoRecord } from "./breath.js";

export const CARD_SIZE = Object.freeze({ width: 1200, height: 900 });
const colors = {
  paper: "#fffaf3",
  ink: "#664938",
  teal: "#168493",
  mint: "#e1f0e8",
  coral: "#d65f53",
  gold: "#b68a42",
  line: "#e8dac6",
};
const serif = '"Hiragino Mincho ProN", "Yu Mincho", serif';
const sans = '"Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif';
const images = new Map();

function loadImage(path) {
  const url = new URL(path, import.meta.url).href;
  if (!images.has(url)) {
    const image = new Image();
    image.src = url;
    images.set(
      url,
      image
        .decode()
        .then(() => image)
        .catch((error) => {
          images.delete(url);
          throw error;
        }),
    );
  }
  return images.get(url);
}

function box(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function text(
  ctx,
  value,
  x,
  y,
  size,
  color,
  family = sans,
  weight = 700,
  align = "left",
) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

function flower(ctx, x, y, radius, color, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(
      0,
      -radius * 0.54,
      radius * 0.33,
      radius * 0.58,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = colors.paper;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx, x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.quadraticCurveTo(x + radius * 0.2, y - radius * 0.2, x + radius, y);
  ctx.quadraticCurveTo(x + radius * 0.2, y + radius * 0.2, x, y + radius);
  ctx.quadraticCurveTo(x - radius * 0.2, y + radius * 0.2, x - radius, y);
  ctx.quadraticCurveTo(x - radius * 0.2, y - radius * 0.2, x, y - radius);
  ctx.fill();
}

function drawGlyphs(
  ctx,
  glyphs,
  mastery,
  { areaTop = 472, areaHeight = 290, maxTile = 120 } = {},
) {
  const columns =
    glyphs.length <= 4
      ? glyphs.length
      : glyphs.length <= 12
        ? 4
        : glyphs.length <= 20
          ? 5
          : 8;
  const rows = Math.ceil(glyphs.length / columns);
  const gap = 10;
  const tile = Math.min(
    maxTile,
    (600 - (columns - 1) * gap) / columns,
    (areaHeight - (rows - 1) * gap) / rows,
  );
  const top = areaTop + (areaHeight - (rows * tile + (rows - 1) * gap)) / 2;
  for (let i = 0; i < glyphs.length; i++) {
    const row = Math.floor(i / columns);
    const inRow = Math.min(columns, glyphs.length - row * columns);
    const x =
      385 -
      (inRow * tile + (inRow - 1) * gap) / 2 +
      (i % columns) * (tile + gap);
    const y = top + row * (tile + gap);
    const reward = mastery && i === glyphs.length - 1;
    box(ctx, x, y + 4, tile, tile, 12, reward ? "#d6bd7c" : "#eaddca");
    box(
      ctx,
      x,
      y,
      tile,
      tile,
      12,
      reward ? "#faedbd" : "#fffdf8",
      reward ? colors.gold : colors.line,
    );
    text(
      ctx,
      glyphs[i],
      x + tile / 2,
      y + tile / 2 + 1,
      tile * 0.73,
      reward ? colors.teal : [colors.coral, colors.teal, colors.gold][i % 3],
      '"Dojo Kanji"',
      700,
      "center",
    );
  }
}

/** Fixed X link card, exported ahead of deployment using the result-card artwork. */
export async function renderLinkPreview() {
  const glyphs = ["武", "謳", "鶯", "王"];
  const [logo, character, fonts] = await Promise.all([
    loadImage("./assets/title-logo-transparent.png"),
    loadImage("./assets/character A.PNG"),
    document.fonts.load('700 80px "Dojo Kanji"', glyphs.join("")),
  ]);
  if (!fonts.length) throw new Error("Game font unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let x = 0; x < 1200; x += 40) {
    ctx.fillStyle = x % 80 ? "#e9d6b6" : "#acd9d6";
    ctx.fillRect(x, 0, 22, 10);
    ctx.fillRect(x, 620, 22, 10);
  }

  ctx.fillStyle = "#edf3e9";
  ctx.beginPath();
  ctx.ellipse(950, 298, 212, 236, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d4bc8199";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(952, 300, 206, 243, 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([7, 12]);
  ctx.strokeStyle = "#9ecabc";
  ctx.beginPath();
  ctx.ellipse(948, 297, 224, 223, -0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  flower(ctx, 751, 62, 15, "#d98d77", 0.2);
  flower(ctx, 1150, 508, 18, "#d5ad61", -0.2);
  sparkle(ctx, 1122, 131, 22, "#d2a65a");
  sparkle(ctx, 751, 260, 15, "#d2a65a");
  sparkle(ctx, 1138, 412, 17, "#d2a65a");
  ctx.drawImage(logo, 67, 76, 2058, 541, 55, 40, 651, 171);

  ctx.save();
  ctx.shadowColor = "#70533618";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  box(ctx, 48, 234, 674, 268, 30, "#fffefa");
  ctx.restore();
  box(ctx, 48, 234, 674, 268, 30, null, colors.line);
  drawGlyphs(ctx, glyphs, false, {
    areaTop: 264,
    areaHeight: 148,
    maxTile: 138,
  });
  text(
    ctx,
    "スマホで遊べる法螺貝ゲーム",
    385,
    461,
    25,
    colors.teal,
    sans,
    700,
    "center",
  );

  const height = 492;
  const width = (height * 771) / 1123;
  ctx.save();
  ctx.shadowColor = "#49796724";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 9;
  ctx.drawImage(
    character,
    426,
    157,
    771,
    1123,
    948 - width / 2,
    32,
    width,
    height,
  );
  ctx.restore();
  box(ctx, 48, 545, 1104, 43, 21, colors.teal);
  text(
    ctx,
    "スマホにふーっと！そなたも挑戦 →",
    600,
    568,
    24,
    "#fffaf3",
    sans,
    700,
    "center",
  );
  text(
    ctx,
    "非公式ファンゲーム · THE IDOLM@STER™ & ©Bandai Namco Entertainment Inc.",
    600,
    605,
    12,
    "#947969",
    sans,
    400,
    "center",
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image export failed")),
      "image/png",
    ),
  );
}

/** Render locally; the image contains only the completed round and public art. */
export async function renderShareCard(result, pose = "A") {
  if (!["A", "B"].includes(pose) || !result.glyphs.length)
    throw new TypeError("Invalid share card");
  const glyphText = result.glyphs.join("");
  const [logo, character, fonts] = await Promise.all([
    loadImage("./assets/title-logo-transparent.png"),
    loadImage(`./assets/character ${pose}.PNG`),
    document.fonts.load('700 80px "Dojo Kanji"', glyphText),
  ]);
  if (!fonts.length) throw new Error("Game font unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = CARD_SIZE.width;
  canvas.height = CARD_SIZE.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Original kimono-inspired border and scattered blossoms.
  for (let x = 0; x < 1200; x += 40) {
    ctx.fillStyle = x % 80 ? "#e9d6b6" : "#acd9d6";
    ctx.fillRect(x, 0, 22, 10);
    ctx.fillRect(x, 890, 22, 10);
  }
  ctx.fillStyle = "#edf3e9";
  ctx.beginPath();
  ctx.ellipse(954, 466, 240, 321, -0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d4bc8199";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(960, 468, 235, 330, 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([7, 12]);
  ctx.strokeStyle = "#9ecabc";
  ctx.beginPath();
  ctx.ellipse(955, 469, 256, 299, -0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  flower(ctx, 748, 80, 15, "#d98d77", 0.2);
  flower(ctx, 1140, 750, 21, "#d5ad61", -0.2);
  flower(ctx, 64, 805, 11, "#98bbb0");
  sparkle(ctx, 1120, 183, 22, "#d2a65a");
  sparkle(ctx, 761, 265, 15, "#d2a65a");
  sparkle(ctx, 1117, 582, 17, "#d2a65a");

  // Transparent logo is framed above the result, away from the character's face.
  ctx.drawImage(logo, 67, 76, 2058, 541, 55, 46, 651, 171);

  ctx.save();
  ctx.shadowColor = "#70533618";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  box(ctx, 48, 244, 674, 553, 30, "#fffefa");
  ctx.restore();
  box(ctx, 48, 244, 674, 553, 30, null, colors.line);
  text(ctx, "本日の、ひと吹き", 80, 279, 24, colors.teal);
  if (result.mode === "demo") {
    box(ctx, 568, 260, 119, 34, 17, colors.mint);
    text(ctx, "おためし", 627, 278, 19, colors.teal, sans, 700, "center");
  }
  const seconds = (Math.floor(result.durationMs / 100) / 10).toFixed(1);
  text(ctx, seconds, 82, 361, 91, colors.teal, "Georgia", 700);
  ctx.font = "700 91px Georgia";
  text(ctx, "秒", 92 + ctx.measureText(seconds).width, 380, 27, colors.ink);
  text(
    ctx,
    String(result.glyphs.length),
    460,
    361,
    91,
    colors.coral,
    "Georgia",
    700,
  );
  ctx.font = "700 91px Georgia";
  text(
    ctx,
    "文字",
    470 + ctx.measureText(String(result.glyphs.length)).width,
    380,
    27,
    colors.ink,
  );
  ctx.strokeStyle = colors.line;
  ctx.setLineDash([5, 7]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 417);
  ctx.lineTo(689, 417);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, "奏でた漢字", 385, 444, 23, colors.ink, sans, 700, "center");
  drawGlyphs(ctx, result.glyphs, result.mastery);

  const crop = pose === "A" ? [426, 157, 771, 1123] : [216, 22, 909, 1346];
  const height = 636;
  const width = (height * crop[2]) / crop[3];
  ctx.save();
  ctx.shadowColor = "#49796724";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 9;
  ctx.drawImage(character, ...crop, 948 - width / 2, 134, width, height);
  ctx.restore();

  // The 7.3-second record and completion each earn their own seal.
  const yoshinoRecord = isYoshinoRecord(result.durationMs);
  if (result.mastery || yoshinoRecord) {
    ctx.save();
    ctx.translate(1065, 709);
    ctx.rotate(yoshinoRecord ? 0.16 : -0.16);
    ctx.fillStyle = "#fffdf2";
    ctx.beginPath();
    ctx.arc(0, 0, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = yoshinoRecord ? colors.coral : colors.gold;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.stroke();
    if (yoshinoRecord) {
      text(ctx, "依田", 0, -23, 42, colors.coral, serif, 700, "center");
      text(ctx, "芳乃", 0, 23, 42, colors.coral, serif, 700, "center");
    } else {
      text(ctx, "皆伝", 0, 2, 43, colors.teal, serif, 700, "center");
    }
    ctx.restore();
  }

  box(ctx, 48, 827, 1104, 43, 21, colors.teal);
  text(
    ctx,
    "スマホにふーっと！そなたも挑戦 →",
    600,
    850,
    24,
    "#fffaf3",
    sans,
    700,
    "center",
  );
  text(
    ctx,
    "非公式ファンゲーム · THE IDOLM@STER™ & ©Bandai Namco Entertainment Inc.",
    600,
    880,
    12,
    "#947969",
    sans,
    400,
    "center",
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image export failed")),
      "image/png",
    ),
  );
}
