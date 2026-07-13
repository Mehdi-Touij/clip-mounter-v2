// Text-to-speech — swappable provider. ElevenLabs now (free key for testing);
// a self-hosted engine (e.g. Kokoro) can slot in behind the same synthesize() later.
const KEY = () => process.env.ELEVENLABS_API_KEY ?? "";
const VOICE = process.env.ELEVEN_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVEN_MODEL ?? "eleven_flash_v2_5";

export function ttsEnabled(): boolean {
  return !!KEY();
}

/** Synthesize speech → MP3 bytes. Throws on API error (caller can fall back). */
export async function synthesize(text: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": KEY(), "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}
