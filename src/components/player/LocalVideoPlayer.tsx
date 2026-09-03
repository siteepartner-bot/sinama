import React, { useEffect, useState } from 'react';
import { DirectVideoPlayer } from './DirectVideoPlayer';

export interface LocalVideoPlayerProps {
  key?: React.Key;
  fileOrBlobUrl: string | File | Blob;
  fileName?: string;
  onEnded?: () => void;
  onError?: (err: string) => void;
}

export function LocalVideoPlayer({
  fileOrBlobUrl,
  fileName = 'فایل ویدیوی محلی',
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
      initialPlayState={true}
      onEnded={onEnded}
      onError={onError}
    />
  );
}
