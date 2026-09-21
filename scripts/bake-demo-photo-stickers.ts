/**
 * Bake demo photo stickers (U2NetP cutout + white rim) into public/images/demo-stickers/.
 * Run: npx tsx scripts/bake-demo-photo-stickers.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const MODEL = path.join(ROOT, "public/models/u2netp/u2netp.onnx");
const OUT_DIR = path.join(ROOT, "public/images/demo-stickers");
const INPUT_SIZE = 320;
const MAX_OUTPUT_SIDE = 640;

const JOBS = [
  { id: "park", src: "public/images/itinerary/nature.jpg" },
  { id: "museum", src: "public/images/itinerary/museum.jpg" },
  { id: "cafe", src: "public/images/itinerary/cafe.jpg" },
  { id: "street", src: "public/images/cafe-suggestion.png" },
  { id: "rain", src: "public/images/events/night-garden-poster.webp" },
] as const;

function rgbaFromRaw(raw: Float32Array, plane: number) {
  let low = Infinity;
  let high = -Infinity;
  for (const value of raw) {
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high - low < 0.08) throw new Error("mask");
  const alpha = Buffer.alloc(plane);
  let foreground = 0;
  for (let index = 0; index < plane; index += 1) {
    const normalized = Math.max(0, Math.min(1, (raw[index]! - low) / (high - low)));
    const eased = normalized <= 0.12 ? 0 : normalized >= 0.88 ? 1 : (normalized - 0.12) / 0.76;
    if (eased > 0.3) foreground += 1;
    alpha[index] = Math.round(eased * 255);
  }
  const ratio = foreground / plane;
  if (ratio < 0.015 || ratio > 0.94) throw new Error(`subject ratio=${ratio.toFixed(3)}`);
  return alpha;
}

async function cutoutWithModel(session: ort.InferenceSession, sourcePath: string) {
  const plane = INPUT_SIZE * INPUT_SIZE;
  const inference = await sharp(sourcePath)
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = inference.data;
  const channels = inference.info.channels;
  const input = new Float32Array(plane * 3);
  const mean = [0.485, 0.456, 0.406];
  const deviation = [0.229, 0.224, 0.225];
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      input[channel * plane + index] = (pixels[index * channels + channel]! / 255 - mean[channel]!) / deviation[channel]!;
    }
  }

  const feeds: Record<string, ort.Tensor> = {
    [session.inputNames[0]!]: new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]),
  };
  const output = await session.run(feeds);
  const raw = output[session.outputNames[0]!]!.data as Float32Array;
  const alpha320 = rgbaFromRaw(raw, plane);

  const meta = await sharp(sourcePath).metadata();
  const sw = meta.width ?? INPUT_SIZE;
  const sh = meta.height ?? INPUT_SIZE;
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const resized = await sharp(sourcePath).resize(width, height).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = await sharp(alpha320, { raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 } })
    .resize(width, height)
    .raw()
    .toBuffer();

  const rgba = Buffer.from(resized.data);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4 + 3] = Math.round((rgba[index * 4 + 3]! * mask[index]!) / 255);
  }

  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3]! < 40) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) throw new Error("bounds");

  const edge = Math.max(9, Math.round(Math.max(width, height) * 0.032));
  const shadow = Math.max(9, Math.round(edge * 1.25));
  const padding = edge + shadow * 2;
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;

  const cut = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  // White rim via dilated alpha composite
  const rim = await sharp(cut)
    .ensureAlpha()
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const rimMeta = await sharp(rim).metadata();
  const rw = rimMeta.width!;
  const rh = rimMeta.height!;
  const rimRaw = await sharp(rim).ensureAlpha().raw().toBuffer();
  const outline = Buffer.alloc(rw * rh * 4);
  for (let y = 0; y < rh; y += 1) {
    for (let x = 0; x < rw; x += 1) {
      let hit = false;
      for (let step = 0; step < 36 && !hit; step += 1) {
        const angle = (step / 36) * Math.PI * 2;
        const sx = Math.round(x - Math.cos(angle) * edge);
        const sy = Math.round(y - Math.sin(angle) * edge);
        if (sx < 0 || sy < 0 || sx >= rw || sy >= rh) continue;
        if (rimRaw[(sy * rw + sx) * 4 + 3]! > 40) hit = true;
      }
      const o = (y * rw + x) * 4;
      if (hit) {
        outline[o] = 255;
        outline[o + 1] = 255;
        outline[o + 2] = 255;
        outline[o + 3] = 255;
      }
    }
  }

  return sharp(outline, { raw: { width: rw, height: rh, channels: 4 } })
    .composite([{ input: rim, blend: "over" }])
    .webp({ quality: 90 })
    .toBuffer();
}

/** Fallback when U2Net fails on scenic photos: soft oval + white rim still reads as a sticker. */
async function stickerFallback(sourcePath: string) {
  const base = await sharp(sourcePath)
    .resize(420, 420, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = base.info;
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.42;
  const ry = height * 0.46;
  const rgba = Buffer.from(base.data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      const alpha = d > 1.05 ? 0 : d > 0.92 ? Math.round((1.05 - d) / 0.13 * 255) : 255;
      rgba[(y * width + x) * 4 + 3] = Math.min(rgba[(y * width + x) * 4 + 3]!, alpha);
    }
  }
  const edge = 14;
  const padding = edge + 18;
  const cut = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const rim = await sharp(cut)
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const rimMeta = await sharp(rim).metadata();
  const rw = rimMeta.width!;
  const rh = rimMeta.height!;
  const rimRaw = await sharp(rim).ensureAlpha().raw().toBuffer();
  const outline = Buffer.alloc(rw * rh * 4);
  for (let y = 0; y < rh; y += 1) {
    for (let x = 0; x < rw; x += 1) {
      let hit = false;
      for (let step = 0; step < 36 && !hit; step += 1) {
        const angle = (step / 36) * Math.PI * 2;
        const sx = Math.round(x - Math.cos(angle) * edge);
        const sy = Math.round(y - Math.sin(angle) * edge);
        if (sx < 0 || sy < 0 || sx >= rw || sy >= rh) continue;
        if (rimRaw[(sy * rw + sx) * 4 + 3]! > 40) hit = true;
      }
      const o = (y * rw + x) * 4;
      if (hit) {
        outline[o] = 255;
        outline[o + 1] = 255;
        outline[o + 2] = 255;
        outline[o + 3] = 255;
      }
    }
  }
  return sharp(outline, { raw: { width: rw, height: rh, channels: 4 } })
    .composite([{ input: rim, blend: "over" }])
    .webp({ quality: 90 })
    .toBuffer();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const session = await ort.InferenceSession.create(MODEL, { executionProviders: ["cpu"] });
  for (const job of JOBS) {
    const src = path.join(ROOT, job.src);
    const dest = path.join(OUT_DIR, `${job.id}.webp`);
    try {
      const buf = await cutoutWithModel(session, src);
      writeFileSync(dest, buf);
      console.log(`ok u2net ${job.id} -> ${path.relative(ROOT, dest)} (${buf.length} bytes)`);
    } catch (error) {
      const buf = await stickerFallback(src);
      writeFileSync(dest, buf);
      console.log(`ok fallback ${job.id} -> ${path.relative(ROOT, dest)} (${buf.length} bytes) :: ${error instanceof Error ? error.message : error}`);
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
