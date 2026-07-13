// Local text embeddings via Transformers.js (all-MiniLM-L6-v2, 384-dim).
// No Python, no external API — runs in-process (WASM backend), model cached on the volume.
import * as path from "path";
import { env, pipeline } from "@huggingface/transformers";
import { PATHS } from "./db";

env.cacheDir = path.join(PATHS.dataDir, "models");
env.allowLocalModels = false;

const MODEL = process.env.EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: Promise<any> | null = null;
function getPipe() {
  if (!_pipe) _pipe = pipeline("feature-extraction", MODEL);
  return _pipe;
}

/** Embed one string → normalized 384-dim vector. */
export async function embed(text: string): Promise<number[]> {
  const pipe = await getPipe();
  const out = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

/** Embed many strings in one pass → array of normalized vectors. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const pipe = await getPipe();
  const out = await pipe(texts, { pooling: "mean", normalize: true });
  const dim = out.dims[out.dims.length - 1] as number;
  const data = out.data as Float32Array;
  const res: number[][] = [];
  for (let i = 0; i < texts.length; i++) res.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
  return res;
}

/** Cosine similarity of two normalized vectors (== dot product). */
export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
