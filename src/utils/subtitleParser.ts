export interface SubtitleCue {
  id: string | number;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
}

/**
 * Converts timestamp string (00:01:23,456 or 00:01:23.456 or 01:23.456) to seconds
 */
function parseTimestamp(timestampStr: string): number {
  const clean = timestampStr.trim().replace(',', '.');
  const parts = clean.split(':');
  
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  } else {
    return parseFloat(clean) || 0;
  }
}

/**
 * Parses raw SRT or WebVTT content into an array of SubtitleCue
 */
export function parseSubtitleContent(content: string): SubtitleCue[] {
  if (!content || !content.trim()) return [];

  // Normalize line breaks
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  
  const cues: SubtitleCue[] = [];
  let i = 0;

  // Skip WEBVTT header if present
  if (lines[0] && lines[0].trim().toUpperCase().startsWith('WEBVTT')) {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '') {
      i++;
    }
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    // Check if this line is an index or a timestamp
    let cueId: string | number = cues.length + 1;
    let timeLine = line;

    if (!line.includes('-->')) {
      cueId = line;
      i++;
      if (i >= lines.length) break;
      timeLine = lines[i].trim();
    }

    if (timeLine.includes('-->')) {
      const [startStr, endStrWithSettings] = timeLine.split('-->');
      if (startStr && endStrWithSettings) {
        const start = parseTimestamp(startStr);
        // Remove any WebVTT cue settings (e.g. "align:start position:10%")
        const endStr = endStrWithSettings.trim().split(' ')[0];
        const end = parseTimestamp(endStr);

        i++;
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
          // Remove HTML tags like <i>, <b>, <c>, etc.
          const cleanText = lines[i].replace(/<\/?[^>]+(>|$)/g, '').trim();
          if (cleanText) {
            textLines.push(cleanText);
          }
          i++;
        }

        if (textLines.length > 0 && end > start) {
          cues.push({
            id: cueId,
            startTime: start,
            endTime: end,
            text: textLines.join('\n')
          });
        }
      }
    }
    i++;
  }

  return cues.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Find the active subtitle text for the given current time and offset
 */
export function getActiveSubtitleText(
  cues: SubtitleCue[],
  currentTime: number,
  offsetSeconds: number = 0
): string | null {
  if (!cues || cues.length === 0) return null;
  const effectiveTime = currentTime + offsetSeconds;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (effectiveTime >= cue.startTime && effectiveTime <= cue.endTime) {
      return cue.text;
    }
  }
  return null;
}
