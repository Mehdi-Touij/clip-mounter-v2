// Local image captioning via Transformers.js (BLIP base) — describes what's ON SCREEN.
// No API, WASM backend, model cached on the volume. Used to enrich scenes with a
// "what's shown" caption so matching isn't limited to what's spoken.
import * as path from "path";
import { env, pipeline, RawImage } from "@huggingface/transformers";
import { PATHS } from "./db";

env.cacheDir = path.join(PATHS.dataDir, "models");
env.allowLocalModels = false;

const MODEL = process.env.CAPTION_MODEL ?? "Xenova/vit-gpt2-image-captioning";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cap: Promise<any> | null = null;
function getCap() {
  if (!_cap) _cap = pipeline("image-to-text", MODEL);
  return _cap;
}

export function captionEnabled(): boolean {
  return process.env.DISABLE_CAPTION !== "1";
}

/** Caption a single image file → short description of what's shown. */
export async function caption(imagePath: string): Promise<string> {
  const cap = await getCap();
  const img = await RawImage.read(imagePath);
  const out = await cap(img);
  const text = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
  return (text ?? "").toString().trim();
}
