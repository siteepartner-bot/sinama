import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { VideoError } from './VideoError';
import { realTimeClient } from '../../services/realtimeClient';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayerProps {
  key?: React.Key;
  videoId: string;
  isPlaying: boolean;
  isMuted?: boolean;
  volume?: number;
  currentTime?: number;
  playbackRate?: number;
  updatedAt?: number;
  onPlayChange?: (isPlaying: boolean, currentTime: number) => void;
  onSeekChange?: (time: number) => void;
  onRateChange?: (rate: number) => void;
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
  updatedAt = 0,
  onPlayChange,
  onSeekChange,
  onRateChange,
  onEnded,
  onError,
}: YouTubePlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const containerId = useRef(`yt_player_${Math.random().toString(36).slice(2, 9)}`);
  const playerRef = useRef<any>(null);
  const isApiReadyRef = useRef<boolean>(false);
  const suppressBroadcast = useRef<number>(0);
  const lastHandledUpdatedAt = useRef<number>(updatedAt);
  const lastKnownTime = useRef<number>(currentTime);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [videoId]);

  // Load YouTube IFrame API Script
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;

    const initPlayer = () => {
      if (!isMounted || !window.YT || !window.YT.Player) return;

      // Clean up previous instance
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }

      try {
        playerRef.current = new window.YT.Player(containerId.current, {
          videoId,
          playerVars: {
            autoplay: isPlaying ? 1 : 0,
            start: Math.floor(currentTime),
            enablejsapi: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : ''
          },
          events: {
            onReady: (event: any) => {
              if (!isMounted) return;
              isApiReadyRef.current = true;
              setIsLoading(false);
              event.target.setVolume(Math.round(volume * 100));
              if (isMuted) {
                event.target.mute();
              }
              if (playbackRate && playbackRate !== 1) {
                event.target.setPlaybackRate(playbackRate);
              }
              if (isPlaying) {
                suppressBroadcast.current++;
                event.target.playVideo();
              }
            },
            onStateChange: (event: any) => {
              if (!isMounted) return;
              const state = event.data;
              const player = event.target;

              // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
              if (state === 1) {
                const cur = player.getCurrentTime ? player.getCurrentTime() : currentTime;
                lastKnownTime.current = cur;

                if (suppressBroadcast.current > 0) {
                  suppressBroadcast.current--;
                  return;
                }

                if (!realTimeClient.isRemoteEventActive) {
                  onPlayChange?.(true, cur);
                }
              } else if (state === 2) {
                const cur = player.getCurrentTime ? player.getCurrentTime() : currentTime;
                lastKnownTime.current = cur;

                if (suppressBroadcast.current > 0) {
                  suppressBroadcast.current--;
                  return;
                }

                if (!realTimeClient.isRemoteEventActive) {
                  onPlayChange?.(false, cur);
                }
              } else if (state === 0) {
                if (!realTimeClient.isRemoteEventActive) {
                  onEnded?.();
                }
              }
            },
            onPlaybackRateChange: (event: any) => {
              if (!isMounted) return;
              if (suppressBroadcast.current > 0) {
                suppressBroadcast.current--;
                return;
              }
              if (!realTimeClient.isRemoteEventActive) {
                onRateChange?.(event.data);
              }
            },
            onError: () => {
              if (!isMounted) return;
              setIsLoading(false);
              setHasError(true);
              onError?.('خطا در بارگذاری پلیر یوتیوب');
            }
          }
        });
      } catch (err) {
        console.warn('Failed to initialize YT Player API:', err);
        setIsLoading(false);
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!window.onYouTubeIframeAPIReady) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const existingCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (existingCallback) existingCallback();
        if (isMounted) initPlayer();
      };
    }

    return () => {
      isMounted = false;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // Synchronize remote play/pause state
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isApiReadyRef.current) return;

    try {
      const state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
      if (isPlaying && state !== 1 && state !== 3) {
        suppressBroadcast.current++;
        player.playVideo();
      } else if (!isPlaying && state === 1) {
        suppressBroadcast.current++;
        player.pauseVideo();
      }
    } catch {
      // Ignore
    }
  }, [isPlaying]);

  // Synchronize remote seek / targetTime updates
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isApiReadyRef.current) return;

    const isNewEvent = updatedAt && updatedAt !== lastHandledUpdatedAt.current;
    if (isNewEvent) {
      lastHandledUpdatedAt.current = updatedAt;
    }

    if (isNewEvent && currentTime !== undefined) {
      try {
        const curr = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
        if (Math.abs(curr - currentTime) > 0.5) {
          suppressBroadcast.current++;
          player.seekTo(currentTime, true);
          lastKnownTime.current = currentTime;
        }
      } catch {
        // Ignore
      }
    }
  }, [currentTime, updatedAt]);

  // Synchronize playback rate
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isApiReadyRef.current) return;
    try {
      if (typeof player.setPlaybackRate === 'function') {
        suppressBroadcast.current++;
        player.setPlaybackRate(playbackRate);
      }
    } catch {
      // Ignore
    }
  }, [playbackRate]);

  // Synchronize volume and mute
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isApiReadyRef.current) return;
    try {
      if (isMuted) {
        player.mute();
      } else {
        player.unMute();
        player.setVolume(Math.round(volume * 100));
      }
    } catch {
      // Ignore
    }
  }, [volume, isMuted]);

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

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden" id="youtube-player-container">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 pointer-events-none">
          <Loader2 className="h-8 w-8 text-rose-500 animate-spin mb-2" />
          <span className="text-xs text-zinc-400">در حال اتصال و همگام‌سازی با یوتیوب...</span>
        </div>
      )}

      {/* Target container for YouTube IFrame API */}
      <div id={containerId.current} className="w-full h-full pointer-events-auto" />
    </div>
  );
}
