import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Loader2, Play, Pause, RotateCcw, RotateCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { VideoControls } from './VideoControls';
import { VideoError } from './VideoError';
import { realTimeClient } from '../../services/realtimeClient';

export interface DirectVideoPlayerProps {
  key?: React.Key;
  src: string;
  title?: string;
  initialPlayState?: boolean;
  targetTime?: number;
  playbackRate?: number;
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
  playbackRate: externalPlaybackRate = 1,
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

  // Visual action flash feedback
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'play' | 'pause' | 'rewind' | 'forward';
    text: string;
    id: number;
  } | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showActionFeedback = (type: 'play' | 'pause' | 'rewind' | 'forward', text: string) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setActionFeedback({ type, text, id: Date.now() });
    feedbackTimeoutRef.current = setTimeout(() => {
      setActionFeedback(null);
    }, 900);
  };

  // Anti-loop lock ref
  const isProgrammaticUpdate = useRef<boolean>(false);

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
      }, 3000);
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

  // Synchronize remote play/pause state
  useEffect(() => {
    if (!videoRef.current) return;
    if (initialPlayState && videoRef.current.paused) {
      isProgrammaticUpdate.current = true;
      videoRef.current.play().catch(() => {
        setIsPlaying(false);
      }).finally(() => {
        setTimeout(() => {
          isProgrammaticUpdate.current = false;
        }, 100);
      });
      setIsPlaying(true);
      showActionFeedback('play', 'پخش همزمان');
    } else if (!initialPlayState && !videoRef.current.paused) {
      isProgrammaticUpdate.current = true;
      videoRef.current.pause();
      setIsPlaying(false);
      showActionFeedback('pause', 'توقف همزمان');
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 100);
    }
  }, [initialPlayState]);

  // Synchronize remote seek target time (compensate drift > 0.75s)
  useEffect(() => {
    if (!videoRef.current || duration <= 0) return;
    const diff = Math.abs(videoRef.current.currentTime - targetTime);
    if (diff > 0.85) {
      isProgrammaticUpdate.current = true;
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      setTimeout(() => {
        isProgrammaticUpdate.current = false;
      }, 100);
    }
  }, [targetTime, duration]);

  // Synchronize remote playback rate
  useEffect(() => {
    if (externalPlaybackRate && externalPlaybackRate !== playbackRate) {
      setPlaybackRate(externalPlaybackRate);
    }
  }, [externalPlaybackRate, playbackRate]);

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

  // Update playback rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle Play/Pause
  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (isEnded) {
      videoRef.current.currentTime = 0;
      setIsEnded(false);
    }

    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        showActionFeedback('play', 'پخش همزمان');
        if (!isProgrammaticUpdate.current && !realTimeClient.isRemoteEventActive) {
          onPlayChange?.(true, videoRef.current?.currentTime || 0);
        }
      }).catch((e) => {
        console.warn('Autoplay blocked or play failed', e);
        setIsPlaying(false);
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      showActionFeedback('pause', 'توقف همزمان');
      if (!isProgrammaticUpdate.current && !realTimeClient.isRemoteEventActive) {
        onPlayChange?.(false, videoRef.current.currentTime || 0);
      }
    }
  };

  // Handle Seek
  const handleSeek = (time: number) => {
    if (!videoRef.current) return;
    const clampedTime = Math.max(0, Math.min(time, duration));
    videoRef.current.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    setIsEnded(false);

    if (!isProgrammaticUpdate.current && !realTimeClient.isRemoteEventActive) {
      onSeekChange?.(clampedTime);
    }
  };

  // Handle Rewind / Fast Forward
  const handleRewind = (seconds: number = 10) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, videoRef.current.currentTime - seconds);
    showActionFeedback('rewind', `${seconds}- ثانیه`);
    handleSeek(newTime);
  };

  const handleForward = (seconds: number = 10) => {
    if (!videoRef.current) return;
    const newTime = Math.min(duration, videoRef.current.currentTime + seconds);
    showActionFeedback('forward', `${seconds}+ ثانیه`);
    handleSeek(newTime);
  };

  // Keyboard Shortcuts for Watch Party Sync (Space: Play/Pause, Left/Right: Seek)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is focused inside an input/textarea/editable element
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        handleRewind(10);
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleForward(10);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration, currentTime, isMuted]);

  // Handle Playback Rate change
  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (!isProgrammaticUpdate.current && !realTimeClient.isRemoteEventActive) {
      onRateChange?.(rate);
    }
  };

  // Handle Volume
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      setIsMuted(false);
    } else if (newVol === 0) {
      setIsMuted(true);
    }
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
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

  // Video element event listeners
  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);

    // Calculate buffered progress
    if (videoRef.current.buffered.length > 0) {
      for (let i = 0; i < videoRef.current.buffered.length; i++) {
        if (
          videoRef.current.buffered.start(i) <= videoRef.current.currentTime &&
          videoRef.current.currentTime <= videoRef.current.buffered.end(i)
        ) {
          setBufferedTime(videoRef.current.buffered.end(i));
          break;
        }
      }
    }
  };

  const onLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
    setIsBuffering(false);
    setHasError(false);

    if (targetTime > 0) {
      videoRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }

    if (initialPlayState) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  };

  const onWaiting = () => setIsBuffering(true);
  const onPlaying = () => {
    setIsBuffering(false);
    setIsPlaying(true);
  };
  const onPause = () => setIsPlaying(false);

  const onVideoEnded = () => {
    setIsPlaying(false);
    setIsEnded(true);
    onEnded?.();
  };

  const onVideoError = () => {
    setIsBuffering(false);
    setHasError(true);
    const msg = 'مرورگر قادر به پخش مستقیم این کدک یا فرمت ویدیویی نیست (فرمت‌های MKV, MP4, WebM, MOV با کدک‌های استاندارد H.264/VP8/VP9/AV1 پشتیبانی می‌شوند).';
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
        onEnded={onVideoEnded}
        onError={onVideoError}
        onClick={handleTogglePlay}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Action Flash Feedback */}
      <AnimatePresence>
        {actionFeedback && (
          <motion.div
            key={actionFeedback.id}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.15 }}
            transition={{ duration: 0.2 }}
            className="absolute z-30 pointer-events-none flex flex-col items-center justify-center p-4 rounded-2xl bg-black/75 backdrop-blur-md border border-zinc-700/80 text-white shadow-2xl"
          >
            {actionFeedback.type === 'play' && <Play className="h-8 w-8 text-rose-500 fill-rose-500 mb-1" />}
            {actionFeedback.type === 'pause' && <Pause className="h-8 w-8 text-amber-400 mb-1" />}
            {actionFeedback.type === 'rewind' && <RotateCcw className="h-8 w-8 text-sky-400 mb-1" />}
            {actionFeedback.type === 'forward' && <RotateCw className="h-8 w-8 text-sky-400 mb-1" />}
            <span className="text-xs font-bold text-zinc-100">{actionFeedback.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buffering Spinner */}
      {isBuffering && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none z-20">
          <Loader2 className="h-10 w-10 text-rose-500 animate-spin mb-2" />
          <span className="text-xs font-semibold text-zinc-300 bg-black/60 px-3 py-1 rounded-full border border-zinc-800">
            در حال بارگذاری ویدیو...
          </span>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && (
        <VideoError
          message={errorMessage}
          onRetry={handleRetry}
        />
      )}

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
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onRewind={handleRewind}
          onForward={handleForward}
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
