"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, LoaderCircle, Plus, X } from "lucide-react";
import NextImage from "next/image";
import styles from "./home.module.css";

const MODEL_URL = "/models/u2netp/u2netp.onnx";
const INPUT_SIZE = 320;
const MAX_OUTPUT_SIDE = 640;

type Runtime = typeof import("onnxruntime-web/wasm");
let sessionPromise: Promise<import("onnxruntime-web").InferenceSession> | null = null;

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = import("onnxruntime-web/wasm").then(async (ort: Runtime) => {
      ort.env.wasm.numThreads = 1;
      return ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    });
  }
  return sessionPromise;
}

async function decodePhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return await createImageBitmap(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

async function makeSticker(file: File) {
  const ort = await import("onnxruntime-web/wasm");
  const source = await decodePhoto(file);
  const inferenceCanvas = canvas(INPUT_SIZE, INPUT_SIZE);
  const inferenceContext = inferenceCanvas.getContext("2d", { willReadFrequently: true });
  if (!inferenceContext) throw new Error("canvas");
  inferenceContext.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const pixels = inferenceContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const plane = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(plane * 3);
  const mean = [0.485, 0.456, 0.406];
  const deviation = [0.229, 0.224, 0.225];
  for (let index = 0; index < plane; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      input[channel * plane + index] = (pixels[index * 4 + channel] / 255 - mean[channel]) / deviation[channel];
    }
  }

  const session = await getSession();
  const output = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]) });
  const raw = output[session.outputNames[0]].data as Float32Array;
  let low = Infinity;
  let high = -Infinity;
  for (const value of raw) { low = Math.min(low, value); high = Math.max(high, value); }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high - low < 0.08) throw new Error("mask");

  const maskData = inferenceContext.createImageData(INPUT_SIZE, INPUT_SIZE);
  let foreground = 0;
  for (let index = 0; index < plane; index += 1) {
    const alpha = Math.max(0, Math.min(1, (raw[index] - low) / (high - low)));
    const eased = alpha <= 0.12 ? 0 : alpha >= 0.88 ? 1 : (alpha - 0.12) / 0.76;
    if (eased > 0.3) foreground += 1;
    maskData.data[index * 4] = 255;
    maskData.data[index * 4 + 1] = 255;
    maskData.data[index * 4 + 2] = 255;
    maskData.data[index * 4 + 3] = Math.round(eased * 255);
  }
  const ratio = foreground / plane;
  if (ratio < 0.015 || ratio > 0.94) throw new Error("subject");
  inferenceContext.putImageData(maskData, 0, 0);

  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const cutout = canvas(width, height);
  const cutoutContext = cutout.getContext("2d");
  if (!cutoutContext) throw new Error("canvas");
  cutoutContext.drawImage(source, 0, 0, width, height);
  cutoutContext.globalCompositeOperation = "destination-in";
  cutoutContext.drawImage(inferenceCanvas, 0, 0, width, height);

  const subjectPixels = cutoutContext.getImageData(0, 0, width, height).data;
  let left = width; let top = height; let right = 0; let bottom = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (subjectPixels[(y * width + x) * 4 + 3] < 40) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right <= left || bottom <= top) throw new Error("bounds");

  const edge = Math.max(9, Math.round(Math.max(width, height) * 0.032));
  const shadow = Math.max(9, Math.round(edge * 1.25));
  const padding = edge + shadow * 2;
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const sticker = canvas(cropWidth + padding * 2, cropHeight + padding * 2);
  const context = sticker.getContext("2d");
  if (!context) throw new Error("canvas");
  const x = padding - left;
  const y = padding - top;
  const outline = canvas(sticker.width, sticker.height);
  const outlineContext = outline.getContext("2d");
  if (!outlineContext) throw new Error("canvas");
  for (let step = 0; step < 36; step += 1) {
    const angle = step / 36 * Math.PI * 2;
    outlineContext.drawImage(cutout, x + Math.cos(angle) * edge, y + Math.sin(angle) * edge);
  }
  outlineContext.globalCompositeOperation = "source-in";
  outlineContext.fillStyle = "white";
  outlineContext.fillRect(0, 0, outline.width, outline.height);
  context.shadowColor = "rgba(71, 47, 59, .24)";
  context.shadowBlur = shadow;
  context.shadowOffsetY = Math.round(edge * 0.8);
  context.drawImage(outline, 0, 0);
  context.shadowColor = "transparent";
  context.drawImage(cutout, x, y);
  source.close();
  return sticker.toDataURL("image/webp", 0.9);
}

export function PhotoSticker({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [targetIndex, setTargetIndex] = useState(0);
  const [arrivingIndex, setArrivingIndex] = useState<number | null>(null);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [compactingFrom, setCompactingFrom] = useState<number | null>(null);
  const [error, setError] = useState("");
  const removalTimers = useRef<number[]>([]);

  useEffect(() => () => removalTimers.current.forEach((timer) => window.clearTimeout(timer)), []);

  function choose(index: number) {
    if (busy || removingIndex !== null) return;
    setTargetIndex(index);
    inputRef.current?.click();
  }

  function removeSticker(index: number) {
    if (busy || removingIndex !== null) return;
    setRemovingIndex(index);
    removalTimers.current.push(window.setTimeout(() => {
      onChange(value.filter((_, itemIndex) => itemIndex !== index));
      setRemovingIndex(null);
      setCompactingFrom(index);
      removalTimers.current.push(window.setTimeout(() => setCompactingFrom(null), 380));
    }, 280));
  }

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = [...value];
      next[targetIndex] = await makeSticker(file);
      onChange(next.filter(Boolean).slice(0, 4));
      setArrivingIndex(targetIndex);
    } catch {
      setError("被写体を読み込めませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.photoStickerEditor} aria-labelledby="photo-sticker-title">
      <div className={styles.photoStickerHeading}>
        <Camera size={17} aria-hidden="true" />
        <strong id="photo-sticker-title">思い出を記録する</strong>
        <small>{value.length}/4</small>
      </div>
      <input ref={inputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => void selectPhoto(event)} />
      <div className={styles.photoStickerSlots} aria-label="思い出シール、4枚まで">
        {Array.from({ length: 4 }, (_, index) => {
          const sticker = value[index];
          const processing = busy && targetIndex === index;
          return <div key={index} className={styles.photoStickerSlot} data-filled={Boolean(sticker)} data-arriving={arrivingIndex === index} data-removing={removingIndex === index} data-shifted={compactingFrom !== null && index >= compactingFrom && Boolean(sticker)} onAnimationEnd={() => { if (arrivingIndex === index) setArrivingIndex(null); }}>
            <button type="button" disabled={busy || removingIndex !== null} aria-label={sticker ? `${index + 1}枚目の写真を入れ替える` : `${index + 1}枚目の写真を追加する`} onClick={() => choose(index)}>
              {sticker ? <NextImage unoptimized width={100} height={100} src={sticker} alt="" /> : processing ? <LoaderCircle className={styles.photoStickerWorking} size={22} aria-hidden="true" /> : <Plus size={24} aria-hidden="true" />}
            </button>
            {sticker && <button type="button" className={styles.photoStickerRemove} disabled={busy || removingIndex !== null} aria-label={`${index + 1}枚目のシールをはずす`} onClick={() => removeSticker(index)}><X size={12} /></button>}
          </div>;
        })}
      </div>
      {busy && <span className="sr-only" role="status">シールを作っています</span>}
      {error && <p className={styles.photoStickerError} role="alert">{error}</p>}
    </section>
  );
}
