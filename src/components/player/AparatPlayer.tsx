import React, { useState, useEffect } from 'react';
import { Loader2, Info } from 'lucide-react';
import { VideoError } from './VideoError';

export interface AparatPlayerProps {
  key?: React.Key;
  videoHash: string;
  isPlaying: boolean;
  onEnded?: () => void;
  onError?: (err: string) => void;
}

export function AparatPlayer({
  videoHash,
  isPlaying,
  onError,
}: AparatPlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showNotice, setShowNotice] = useState(true);

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
  const embedUrl = `https://www.aparat.com/video/video/embed/videohash/${videoHash}/vt/frame?autoplay=${isPlaying ? 'true' : 'false'}&recom=none`;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden" id="aparat-player-container">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <Loader2 className="h-8 w-8 text-rose-500 animate-spin mb-2" />
          <span className="text-xs text-zinc-400">در حال اتصال به آپارات...</span>
        </div>
      )}

      {/* Honest Limitation Notice for Aparat */}
      {showNotice && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900/90 border border-amber-500/30 text-amber-300 text-[11px] rounded-xl backdrop-blur-md shadow-lg">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>توجه: امبد آپارات به دلیل محدودیت‌های مرورگر API ارسال دوطرفه ندارد؛ برای هماهنگی کامل ثانیه‌ای، لینک مستقیم یا یوتیوب پیشنهاد می‌شود.</span>
          </div>
          <button
            type="button"
            onClick={() => setShowNotice(false)}
            className="text-zinc-400 hover:text-white text-xs px-1.5 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
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
