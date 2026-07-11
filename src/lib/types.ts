// Timeline JSON contract — shared between planner, worker, and UI.

export interface TimelineSegment {
  videoId: string;       // Our DB video id (source video this scene is cut from)
  youtubeUrl: string;    // Original YouTube URL
  trimStart: number;     // Start time in seconds (from original video) — authoritative, from our transcript
  trimEnd: number | null; // End time in seconds (null = until end)
  reason?: string;       // Why the AI chose this segment (legacy)
  // Recreation fields:
  sceneTitle?: string;   // Short topic label for the scene
  newText?: string;      // AI-reworded transcript for this scene (same meaning, new wording).
                         // Shown as the new script; NOT yet spoken (TTS audio comes later).
  originalText?: string; // The original spoken words for this scene (for side-by-side review)
}

export interface Timeline {
  fps: number;
  width: number;
  height: number;
  segments: TimelineSegment[];
}

export const RENDER_CONFIG = {
  fps: 30,
  width: 1080,
  height: 1920,
} as const;