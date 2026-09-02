import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { VideoError } from './VideoError';
import { realTimeClient } from '../../services/realtimeClient';

export interface YouTubePlayerProps {
  key?: React.Key;
  videoId: string;
  isPlaying: boolean;
  isMuted?: boolean;
  volume?: number;
  currentTime?: number;
  playbackRate?: number;
  onPlayChange?: (isPlaying: boolean, currentTime: number) => void;
  onSeekChange?: (time: number) => void;
  onEnded?: () => void;
  onError?: (err: string) => void;
}

export function YouTubePlayer({
  videoId,
  isPlaying,
  isMuted = false,
  volume = 0.9,
  currentTime = 0,
  playbackRate = 1,
  onPlayChange,
  onSeekChange,
  onEnded,
  onError,
}: YouTubePlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isProgrammatic = useRef<boolean>(false);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [videoId]);

  // Send postMessage to YouTube IFrame player API
  const sendIframeCommand = (func: string, args: any[] = []) => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    try {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func,
          args
        }),
        '*'
      );
    } catch {
      // Ignore
    }
  };

  // Sync play/pause commands to iframe
  useEffect(() => {
    if (isLoading || hasError) return;
    isProgrammatic.current = true;
    if (isPlaying) {
      sendIframeCommand('playVideo');
    } else {
      sendIframeCommand('pauseVideo');
    }
    setTimeout(() => {
      isProgrammatic.current = false;
    }, 150);
  }, [isPlaying, isLoading, hasError]);

  // Sync seek command to iframe
  useEffect(() => {
    if (isLoading || hasError || currentTime <= 0) return;
    isProgrammatic.current = true;
    sendIframeCommand('seekTo', [currentTime, true]);
    setTimeout(() => {
      isProgrammatic.current = false;
    }, 150);
  }, [currentTime, isLoading, hasError]);

  if (!videoId) {
    return (
      <VideoError
        message="شناسه ویدیوی یوتیوب معتبر نمی‌باشد. لطفاً آدرس را مجدداً بررسی کنید."
        onRetry={() => setHasError(false)}
      />
    );
  }

  if (hasError) {
    return (
      <VideoError
        message="امکان بارگذاری ویدیوی یوتیوب وجود ندارد. ممکن است ویدیو خصوصی باشد یا پخش آن در سایت‌های دیگر توسط سازنده غیرفعال شده باشد."
        onRetry={() => {
          setHasError(false);
          setIsLoading(true);
        }}
      />
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedParams = new URLSearchParams({
    enablejsapi: '1',
    autoplay: isPlaying ? '1' : '0',
    mute: isMuted ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    ...(currentTime > 0 ? { start: Math.floor(currentTime).toString() } : {}),
    ...(origin ? { origin } : {})
  });

  const embedUrl = `https://www.youtube.com/embed/${videoId}?${embedParams.toString()}`;

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden" id="youtube-player-container">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 pointer-events-none">
          <Loader2 className="h-8 w-8 text-rose-500 animate-spin mb-2" />
          <span className="text-xs text-zinc-400">در حال بارگذاری پلیر یوتیوب...</span>
        </div>
      )}

      <iframe
        ref={iframeRef}
        key={`yt_${videoId}`}
        src={embedUrl}
        title="YouTube Video Player"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
          onError?.('خطا در بارگذاری پلیر یوتیوب');
        }}
        className="w-full h-full border-0 pointer-events-auto"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
