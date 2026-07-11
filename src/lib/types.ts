// Timeline JSON contract — shared between planner, worker, and UI.

export interface TimelineSegment {
  videoId: string;       // YouTube video ID (from our DB)
  youtubeUrl: string;    // Original YouTube URL
  trimStart: number;     // Start time in seconds (from original video)
  trimEnd: number | null; // End time in seconds (null = until end)
  reason?: string;       // Why the AI chose this segment
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