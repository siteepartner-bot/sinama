import React, { useEffect, useState } from 'react';
import { DirectVideoPlayer } from './DirectVideoPlayer';

export interface LocalVideoPlayerProps {
  key?: React.Key;
  fileOrBlobUrl: string | File | Blob;
  fileName?: string;
  initialPlayState?: boolean;
  targetTime?: number;
  updatedAt?: number;
  playbackRate?: number;
  onPlayChange?: (isPlaying: boolean, currentTime: number) => void;
  onSeekChange?: (time: number) => void;
  onRateChange?: (rate: number) => void;
  onEnded?: () => void;
  onError?: (err: string) => void;
}

export function LocalVideoPlayer({
  fileOrBlobUrl,
  fileName = 'فایل ویدیوی محلی',
  initialPlayState = true,
  targetTime = 0,
  updatedAt = 0,
  playbackRate = 1,
  onPlayChange,
  onSeekChange,
  onRateChange,
  onEnded,
  onError,
}: LocalVideoPlayerProps) {
  const [objectUrl, setObjectUrl] = useState<string>('');

  useEffect(() => {
    let url = '';
    if (typeof fileOrBlobUrl === 'string') {
      url = fileOrBlobUrl;
      setObjectUrl(url);
    } else if (fileOrBlobUrl && typeof fileOrBlobUrl === 'object') {
      url = URL.createObjectURL(fileOrBlobUrl);
      setObjectUrl(url);
    }

    // Clean up object URL on change or unmount to avoid memory leaks
    return () => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    };
  }, [fileOrBlobUrl]);

  if (!objectUrl) {
    return null;
  }

  return (
    <DirectVideoPlayer
      key={objectUrl}
      src={objectUrl}
      title={fileName}
      initialPlayState={initialPlayState}
      targetTime={targetTime}
      updatedAt={updatedAt}
      playbackRate={playbackRate}
      onPlayChange={onPlayChange}
      onSeekChange={onSeekChange}
      onRateChange={onRateChange}
      onEnded={onEnded}
      onError={onError}
    />
  );
}
