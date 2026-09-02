/**
 * Video URL parsing and validation utilities for YouTube, Aparat, and Direct URLs.
 */

export interface ParsedYouTube {
  isValid: boolean;
  videoId: string | null;
  startTime?: number;
}

export interface ParsedAparat {
  isValid: boolean;
  videoHash: string | null;
}

/**
 * Extracts YouTube video ID from various URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - Plain 11-character video ID
 */
export function parseYouTubeUrl(url: string): ParsedYouTube {
  if (!url || typeof url !== 'string') {
    return { isValid: false, videoId: null };
  }

  const clean = url.trim();

  // Check if it's already an 11-char alphanumeric ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return { isValid: true, videoId: clean };
  }

  try {
    // Regex for all YouTube formats
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = clean.match(ytRegex);

    if (match && match[1]) {
      // Check for start time parameter (e.g. ?t=120 or &t=2m10s)
      let startTime = 0;
      const timeMatch = clean.match(/[?&]t=(\d+h)?(\d+m)?(\d+s)?(\d+)?/i);
      if (timeMatch) {
        if (timeMatch[4]) {
          startTime = parseInt(timeMatch[4], 10);
        } else {
          const hours = parseInt(timeMatch[1] || '0', 10) || 0;
          const mins = parseInt(timeMatch[2] || '0', 10) || 0;
          const secs = parseInt(timeMatch[3] || '0', 10) || 0;
          startTime = hours * 3600 + mins * 60 + secs;
        }
      }

      return {
        isValid: true,
        videoId: match[1],
        startTime: startTime > 0 ? startTime : undefined
      };
    }
  } catch {
    // URL parsing fallback failed
  }

  return { isValid: false, videoId: null };
}

/**
 * Extracts Aparat video hash / ID from various URL formats:
 * - https://www.aparat.com/v/VIDEO_HASH
 * - https://www.aparat.com/v/VIDEO_HASH/video_title
 * - https://www.aparat.com/video/video/embed/videohash/VIDEO_HASH/vt/frame
 */
export function parseAparatUrl(url: string): ParsedAparat {
  if (!url || typeof url !== 'string') {
    return { isValid: false, videoHash: null };
  }

  const clean = url.trim();

  try {
    // Pattern 1: aparat.com/v/HASH or aparat.com/v/HASH/anything
    const pattern1 = /aparat\.com\/v\/([a-zA-Z0-9_-]+)/i;
    const match1 = clean.match(pattern1);
    if (match1 && match1[1]) {
      return { isValid: true, videoHash: match1[1] };
    }

    // Pattern 2: aparat.com/video/video/embed/videohash/HASH/vt/frame
    const pattern2 = /videohash\/([a-zA-Z0-9_-]+)/i;
    const match2 = clean.match(pattern2);
    if (match2 && match2[1]) {
      return { isValid: true, videoHash: match2[1] };
    }

    // Pattern 3: plain alphanumeric video hash (usually 4-10 characters)
    if (/^[a-zA-Z0-9_-]{4,15}$/.test(clean)) {
      return { isValid: true, videoHash: clean };
    }
  } catch {
    // Fallback
  }

  return { isValid: false, videoHash: null };
}

/**
 * Validates direct video URLs (MP4, WebM, OGG, MOV, or general stream URLs)
 */
export function isValidDirectVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();

  // Must start with http://, https://, or blob:
  if (!clean.startsWith('http://') && !clean.startsWith('https://') && !clean.startsWith('blob:')) {
    return false;
  }

  return true;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatVideoTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSecs = Math.floor(seconds);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const paddedMins = String(mins).padStart(2, '0');
  const paddedSecs = String(secs).padStart(2, '0');

  if (hours > 0) {
    const paddedHours = String(hours).padStart(2, '0');
    return `${paddedHours}:${paddedMins}:${paddedSecs}`;
  }

  return `${paddedMins}:${paddedSecs}`;
}
