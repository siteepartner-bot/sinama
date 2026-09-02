import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { VideoError } from './VideoError';

export interface AparatPlayerProps {
  key?: React.Key;
  videoHash: string;
  isPlaying: boolean;
  currentTime?: number;
  onEnded?: () => void;
  onError?: (err: string) => void;
}

export function AparatPlayer({
  videoHash,
  isPlaying,
  currentTime = 0,
  onError,
}: AparatPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [videoHash]);

  if (!videoHash) {
    return (
      <VideoError
        message="لینک آپارات معتبر نیست یا شناسه ویدیو یافت نشد."
        onRetry={() => setHasError(false)}
      />
    );
  }

  if (hasError) {
    return (
      <VideoError
        message="امکان بارگذاری ویدیوی آپارات وجود ندارد. لطفاً صحت لینک یا اتصال اینترنت خود را بررسی کنید."
        onRetry={() => {
          setHasError(false);
          setIsLoading(true);
        }}
      />
    );
  }

  // Official Aparat Embed iframe format
  const startParam = currentTime > 0 ? `&start=${Math.floor(currentTime)}` : '';
  const embedUrl = `https://www.aparat.com/video/video/embed/videohash/${videoHash}/vt/frame?autoplay=${isPlaying ? 'true' : 'false'}&recom=none${startParam}`;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden" id="aparat-player-container">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <Loader2 className="h-8 w-8 text-rose-500 animate-spin mb-2" />
          <span className="text-xs text-zinc-400">در حال اتصال به آپارات...</span>
        </div>
      )}

      <iframe
        key={`aparat_${videoHash}`}
        src={embedUrl}
        title="Aparat Video Player"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
          onError?.('خطا در بارگذاری ویدیوی آپارات');
        }}
        className="w-full h-full border-0 pointer-events-auto"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
