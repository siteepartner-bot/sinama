import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Loader2, VolumeX, CheckCircle2 } from 'lucide-react';
import { VideoControls } from './VideoControls';
import { VideoError } from './VideoError';
import { realTimeClient } from '../../services/realtimeClient';

export interface DirectVideoPlayerProps {
  key?: React.Key;
  src: string;
  title?: string;
  initialPlayState?: boolean;
  targetTime?: number;
  updatedAt?: number;
  playbackRate?: number;
  canControlVideo?: boolean;
  isHost?: boolean;
  allowAnyoneControl?: boolean;
  onPlayChange?: (isPlaying: boolean, currentTime: number) => void;
  onSeekChange?: (time: number) => void;
  onRateChange?: (rate: number) => void;
  onEnded?: () => void;
  onError?: (msg: string) => void;
}

export function DirectVideoPlayer({
  src,
  title = 'ویدیوی مستقیم',
  initialPlayState = false,
  targetTime = 0,
  updatedAt = 0,
  playbackRate: externalPlaybackRate = 1,
  canControlVideo = true,
  isHost = false,
  allowAnyoneControl = true,
  onPlayChange,
  onSeekChange,
  onRateChange,
  onEnded,
  onError,
}: DirectVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState<boolean>(initialPlayState);
  const [currentTime, setCurrentTime] = useState<number>(targetTime);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedTime, setBufferedTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(externalPlaybackRate);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Prevent programmatic remote updates from looping back as local events
  const suppressPlayBroadcast = useRef<number>(0);
  const suppressPauseBroadcast = useRef<number>(0);
  const suppressSeekBroadcast = useRef<number>(0);
  const suppressRateBroadcast = useRef<number>(0);
  const lastHandledUpdatedAt = useRef<number>(updatedAt);

  // Auto hide controls
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerControlsShow = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [isPlaying]);

  useEffect(() => {
    triggerControlsShow();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying, triggerControlsShow]);

  // Show transient sync feedback toast
  const showFeedbackToast = useCallback((msg: string) => {
    setSyncFeedback(msg);
    setTimeout(() => {
      setSyncFeedback((prev) => (prev === msg ? null : prev));
    }, 2500);
  }, []);

  // Synchronize remote play, pause, seek, and rate changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isNewEvent = updatedAt && updatedAt !== lastHandledUpdatedAt.current;
    if (isNewEvent) {
      lastHandledUpdatedAt.current = updatedAt;
    }

    // 1. Play / Pause Synchronization
    if (initialPlayState !== undefined) {
      if (initialPlayState && video.paused) {
        suppressPlayBroadcast.current++;
        // If targetTime specified and drift > 0.4s, align time too
        if (targetTime !== undefined && Math.abs(video.currentTime - targetTime) > 0.4) {
          suppressSeekBroadcast.current++;
          video.currentTime = targetTime;
          setCurrentTime(targetTime);
        }

        video
          .play()
          .then(() => {
            setIsPlaying(true);
            setAutoplayBlocked(false);
          })
          .catch((err) => {
            console.warn('Autoplay blocked, falling back to muted playback:', err);
            suppressPlayBroadcast.current++;
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => {
                setIsPlaying(true);
                setAutoplayBlocked(true);
              })
              .catch(() => {
                setIsPlaying(false);
              });
          });
      } else if (!initialPlayState && !video.paused) {
        suppressPauseBroadcast.current++;
        video.pause();
        setIsPlaying(false);
        if (targetTime !== undefined && Math.abs(video.currentTime - targetTime) > 0.3) {
          suppressSeekBroadcast.current++;
          video.currentTime = targetTime;
          setCurrentTime(targetTime);
        }
      }
    }

    // 2. Explicit remote seek event
    if (isNewEvent && targetTime !== undefined) {
      const drift = Math.abs(video.currentTime - targetTime);
      if (drift > 0.3) {
        suppressSeekBroadcast.current++;
        video.currentTime = targetTime;
        setCurrentTime(targetTime);
      }
    }

    // 3. Playback rate synchronization
    if (externalPlaybackRate && Math.abs(video.playbackRate - externalPlaybackRate) > 0.05) {
      suppressRateBroadcast.current++;
      video.playbackRate = externalPlaybackRate;
      setPlaybackRate(externalPlaybackRate);
    }
  }, [initialPlayState, updatedAt, targetTime, externalPlaybackRate]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Update volume & muted on video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Handle Play/Pause by local user action
  const handleTogglePlay = useCallback(() => {
    if (!canControlVideo) {
      setSyncFeedback('کنترل ویدیو در انحصار مالک اتاق است');
      setTimeout(() => setSyncFeedback(null), 3000);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (isEnded) {
      video.currentTime = 0;
      setIsEnded(false);
    }

    if (video.paused) {
      video.play().catch((e) => {
        console.warn('Play request failed:', e);
        setIsPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [isEnded, canControlVideo]);

  // Handle Seek by local user action
  const handleSeek = useCallback((time: number) => {
    if (!canControlVideo) {
      setSyncFeedback('کنترل ویدیو در انحصار مالک اتاق است');
      setTimeout(() => setSyncFeedback(null), 3000);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const clampedTime = Math.max(0, Math.min(time, duration > 0 ? duration : Infinity));
    video.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    setIsEnded(false);
  }, [duration, canControlVideo]);

  // Handle Playback Rate change by local user action
  const handlePlaybackRateChange = useCallback((rate: number) => {
    if (!canControlVideo) {
      setSyncFeedback('کنترل ویدیو در انحصار مالک اتاق است');
      setTimeout(() => setSyncFeedback(null), 3000);
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, [canControlVideo]);

  // Handle Volume
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    } else if (newVol === 0) {
      setIsMuted(true);
    }
    setAutoplayBlocked(false);
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
    setAutoplayBlocked(false);
  };

  // Handle Fullscreen
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Error attempting to enable fullscreen:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.error('Error attempting to exit fullscreen:', err);
      });
    }
  };

  // Handle Picture in Picture
  const handleTogglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error', err);
    }
  };

  // Keyboard Shortcuts (Space, K, J, L, Arrow Left, Arrow Right, M, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focused in input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'ArrowRight' || e.key.toLowerCase() === 'l') {
        e.preventDefault();
        handleSeek((videoRef.current?.currentTime || currentTime) + (e.code === 'ArrowRight' ? 5 : 10));
      } else if (e.code === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        handleSeek((videoRef.current?.currentTime || currentTime) - (e.code === 'ArrowLeft' ? 5 : 10));
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, handleSeek, currentTime]);

  // Video element event listeners
  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    // Calculate buffered progress
    if (video.buffered.length > 0) {
      for (let i = 0; i < video.buffered.length; i++) {
        if (
          video.buffered.start(i) <= video.currentTime &&
          video.currentTime <= video.buffered.end(i)
        ) {
          setBufferedTime(video.buffered.end(i));
          break;
        }
      }
    }
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    setIsBuffering(false);
    setHasError(false);

    if (targetTime > 0) {
      video.currentTime = targetTime;
      setCurrentTime(targetTime);
    }

    if (initialPlayState) {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
    }
  };

  const onWaiting = () => setIsBuffering(true);

  const onPlaying = () => {
    setIsBuffering(false);
    setIsPlaying(true);
    setAutoplayBlocked(false);

    if (suppressPlayBroadcast.current > 0) {
      suppressPlayBroadcast.current--;
      return;
    }

    if (!realTimeClient.isRemoteEventActive) {
      const video = videoRef.current;
      const time = video ? video.currentTime : currentTime;
      onPlayChange?.(true, time);
      showFeedbackToast('پخش برای همه همگام شد');
    }
  };

  const onPause = () => {
    setIsPlaying(false);

    if (suppressPauseBroadcast.current > 0) {
      suppressPauseBroadcast.current--;
      return;
    }

    if (!realTimeClient.isRemoteEventActive && !videoRef.current?.ended) {
      const video = videoRef.current;
      const time = video ? video.currentTime : currentTime;
      onPlayChange?.(false, time);
      showFeedbackToast('توقف برای همه همگام شد');
    }
  };

  const onSeeked = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    if (suppressSeekBroadcast.current > 0) {
      suppressSeekBroadcast.current--;
      return;
    }

    if (!realTimeClient.isRemoteEventActive) {
      onSeekChange?.(video.currentTime);
      showFeedbackToast('تغییر زمان برای همه همگام شد');
    }
  };

  const onRateChangeInternal = () => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackRate(video.playbackRate);

    if (suppressRateBroadcast.current > 0) {
      suppressRateBroadcast.current--;
      return;
    }

    if (!realTimeClient.isRemoteEventActive) {
      onRateChange?.(video.playbackRate);
    }
  };

  const onVideoEnded = () => {
    setIsPlaying(false);
    setIsEnded(true);
    if (!realTimeClient.isRemoteEventActive) {
      onEnded?.();
    }
  };

  const onVideoError = () => {
    setIsBuffering(false);
    setHasError(true);
    const msg =
      'مرورگر قادر به پخش مستقیم این کدک یا فرمت ویدیویی نیست (فرمت‌های MKV, MP4, WebM, MOV با کدک‌های استاندارد H.264/VP8/VP9/AV1 پشتیبانی می‌شوند).';
    setErrorMessage(msg);
    onError?.(msg);
  };

  const handleRetry = () => {
    setHasError(false);
    setIsBuffering(true);
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  const handleUnblockAudio = () => {
    setAutoplayBlocked(false);
    setIsMuted(false);
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControlsShow}
      onClick={triggerControlsShow}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group select-none"
      id="direct-video-player-container"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={src}
        playsInline
        crossOrigin="anonymous"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onWaiting={onWaiting}
        onPlaying={onPlaying}
        onPause={onPause}
        onSeeked={onSeeked}
        onRateChange={onRateChangeInternal}
        onEnded={onVideoEnded}
        onError={onVideoError}
        onClick={handleTogglePlay}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Buffering Spinner */}
      {isBuffering && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none z-20">
          <Loader2 className="h-10 w-10 text-rose-500 animate-spin mb-2" />
          <span className="text-xs font-semibold text-zinc-300 bg-black/60 px-3 py-1 rounded-full border border-zinc-800">
            در حال بارگذاری ویدیو...
          </span>
        </div>
      )}

      {/* Autoplay blocked sound banner */}
      {autoplayBlocked && isPlaying && (
        <button
          type="button"
          onClick={handleUnblockAudio}
          className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/90 hover:bg-amber-500 text-black text-xs font-bold rounded-full shadow-2xl backdrop-blur-md cursor-pointer z-30 transition-all hover:scale-105"
        >
          <VolumeX className="h-4 w-4" />
          <span>ویدیو همگام شد — برای وصل صدا کلیک کنید</span>
        </button>
      )}

      {/* Real-Time Sync Feedback Toast */}
      {syncFeedback && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/90 text-white text-xs font-semibold rounded-xl shadow-xl backdrop-blur-md z-30 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && <VideoError message={errorMessage} onRetry={handleRetry} />}

      {/* Controls Overlay */}
      {!hasError && (
        <VideoControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          bufferedTime={bufferedTime}
          volume={volume}
          isMuted={isMuted}
          playbackRate={playbackRate}
          videoTitle={title}
          showControls={showControls}
          isFullscreen={isFullscreen}
          canControlVideo={canControlVideo}
          isHost={isHost}
          allowAnyoneControl={allowAnyoneControl}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onPlaybackRateChange={handlePlaybackRateChange}
          onToggleFullscreen={handleToggleFullscreen}
          onTogglePiP={handleTogglePiP}
        />
      )}
    </div>
  );
}

