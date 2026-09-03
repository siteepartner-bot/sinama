import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
  Sparkles,
  Loader2,
  Tv,
  Film,
  FolderOpen,
  Volume1,
  CheckCircle2,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { webRTCManager } from '../../services/webRTCManager';
import { ProgressBar } from './ProgressBar';
import { VolumeControl } from './VolumeControl';
import { QualityMenu } from './QualityMenu';
import { FullscreenButton } from './FullscreenButton';
import { formatVideoTime } from '../../utils/mediaParsers';

export interface LocalVideoPlayerProps {
  key?: React.Key;
  fileOrBlobUrl: string | File | Blob;
  fileName?: string;
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
  onError?: (err: string) => void;
}

export function LocalVideoPlayer({
  fileOrBlobUrl,
  fileName = 'فایل ویدیوی سیستم',
  initialPlayState = true,
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
}: LocalVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [objectUrl, setObjectUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(initialPlayState);
  const [currentTime, setCurrentTime] = useState<number>(targetTime);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedTime, setBufferedTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(externalPlaybackRate);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [isStreamingLive, setIsStreamingLive] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocalActionTimeRef = useRef<number>(0);
  const lastHandledUpdatedAt = useRef<number>(updatedAt);

  // Manage object URL
  useEffect(() => {
    let url = '';
    if (typeof fileOrBlobUrl === 'string') {
      url = fileOrBlobUrl;
      setObjectUrl(url);
    } else if (fileOrBlobUrl && typeof fileOrBlobUrl === 'object') {
      url = URL.createObjectURL(fileOrBlobUrl);
      setObjectUrl(url);
    }

    return () => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    };
  }, [fileOrBlobUrl]);

  // Show sync feedback toast
  const showFeedbackToast = useCallback((msg: string) => {
    setSyncFeedback(msg);
    setTimeout(() => {
      setSyncFeedback((prev) => (prev === msg ? null : prev));
    }, 2500);
  }, []);

  // Start movie streaming via WebRTC captureStream when video element is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !objectUrl) return;

    let isCancelled = false;

    const startStreaming = async () => {
      try {
        console.log('[LOCAL MOVIE STREAM] Initiating WebRTC captureStream for local file:', fileName);
        const res = await webRTCManager.startMovieStream(video, fileName, video.duration || 0);
        if (!isCancelled && res.success) {
          setIsStreamingLive(true);
          console.log('[LOCAL MOVIE STREAM] Stream live broadcast active');
        }
      } catch (err) {
        console.error('[LOCAL MOVIE STREAM] Failed to start captureStream:', err);
      }
    };

    const handleCanPlay = () => {
      startStreaming();
    };

    if (video.readyState >= 2) {
      startStreaming();
    } else {
      video.addEventListener('canplay', handleCanPlay, { once: true });
    }

    return () => {
      isCancelled = true;
      video.removeEventListener('canplay', handleCanPlay);
      webRTCManager.stopMovieStream();
      setIsStreamingLive(false);
    };
  }, [objectUrl, fileName]);

  // Listen for remote movie control and seek requests from room peers
  useEffect(() => {
    const unsubControl = webRTCManager.onMovieControlRequest((data) => {
      const video = videoRef.current;
      if (!video) return;

      console.log('[LOCAL MOVIE STREAM] Remote control request received:', data);
      if (data.action === 'play') {
        if (data.currentTime !== undefined && Math.abs(video.currentTime - data.currentTime) > 0.5) {
          video.currentTime = data.currentTime;
        }
        video.play().then(() => {
          setIsPlaying(true);
          showFeedbackToast('پخش توسط یکی از اعضا آغاز شد');
        }).catch(() => {});
      } else if (data.action === 'pause') {
        if (data.currentTime !== undefined && Math.abs(video.currentTime - data.currentTime) > 0.5) {
          video.currentTime = data.currentTime;
        }
        video.pause();
        setIsPlaying(false);
        showFeedbackToast('توقف توسط یکی از اعضا اعمال شد');
      } else if (data.action === 'stop') {
        video.pause();
        video.currentTime = 0;
        setIsPlaying(false);
      }
    });

    const unsubSeek = webRTCManager.onMovieSeekRequest((data) => {
      const video = videoRef.current;
      if (!video) return;

      console.log('[LOCAL MOVIE STREAM] Remote seek request received:', data);
      video.currentTime = data.currentTime;
      setCurrentTime(data.currentTime);
      if (data.isPlaying !== undefined) {
        if (data.isPlaying && video.paused) {
          video.play().catch(() => {});
          setIsPlaying(true);
        } else if (!data.isPlaying && !video.paused) {
          video.pause();
          setIsPlaying(false);
        }
      }
      showFeedbackToast('زمان پخش توسط یکی از اعضا تغییر یافت');
    });

    return () => {
      unsubControl();
      unsubSeek();
    };
  }, [showFeedbackToast]);

  // Handle external synchronization updates (if host/member emits standard room media events)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isNewEvent = Boolean(updatedAt && updatedAt !== lastHandledUpdatedAt.current);
    if (isNewEvent) {
      lastHandledUpdatedAt.current = updatedAt;
    }

    if (targetTime !== undefined && (isNewEvent || Math.abs(video.currentTime - targetTime) > 0.5)) {
      video.currentTime = targetTime;
      setCurrentTime(targetTime);
    }

    if (initialPlayState !== undefined) {
      if (initialPlayState && video.paused) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      } else if (!initialPlayState && !video.paused) {
        video.pause();
        setIsPlaying(false);
      }
    }

    if (externalPlaybackRate && Math.abs(video.playbackRate - externalPlaybackRate) > 0.05) {
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

  // Update volume & mute on video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Auto hide controls
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

  // Local Play / Pause toggle
  const handleTogglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isEnded) {
      video.currentTime = 0;
      setIsEnded(false);
    }

    const nextPlaying = video.paused || video.ended;
    const time = video.currentTime;
    lastLocalActionTimeRef.current = Date.now();

    if (nextPlaying) {
      video.play().catch((e) => {
        console.warn('Play failed:', e);
        setIsPlaying(false);
      });
      setIsPlaying(true);
      onPlayChange?.(true, time);
      showFeedbackToast('پخش زنده برای همه آغاز شد');
    } else {
      video.pause();
      setIsPlaying(false);
      onPlayChange?.(false, time);
      showFeedbackToast('پخش برای همه متوقف شد');
    }
  }, [isEnded, onPlayChange, showFeedbackToast]);

  // Local Seek
  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;

    const clampedTime = Math.max(0, Math.min(time, duration > 0 ? duration : Infinity));
    lastLocalActionTimeRef.current = Date.now();
    video.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    setIsEnded(false);

    onSeekChange?.(clampedTime);
    showFeedbackToast('تغییر زمان برای همه همگام شد');
  }, [duration, onSeekChange, showFeedbackToast]);

  // Local Playback Rate
  const handlePlaybackRateChange = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    lastLocalActionTimeRef.current = Date.now();
    video.playbackRate = rate;
    setPlaybackRate(rate);
    onRateChange?.(rate);
  }, [onRateChange]);

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

  const handleToggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error('Fullscreen toggle error', e);
    }
  };

  // Video Native Event Handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);

    if (video.buffered.length > 0) {
      try {
        setBufferedTime(video.buffered.end(video.buffered.length - 1));
      } catch {}
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);

    if (targetTime > 0) {
      video.currentTime = targetTime;
    }
    if (initialPlayState) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setIsEnded(true);
    onEnded?.();
  };

  if (!objectUrl) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-black text-zinc-400 p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-rose-500 mb-3" />
        <span className="text-xs">در حال آماده‌سازی فایل ویدیوی محلی...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControlsShow}
      onMouseEnter={triggerControlsShow}
      className="relative flex items-center justify-center w-full h-full bg-black overflow-hidden select-none group"
      id="local-video-player-container"
    >
      {/* Native Video Tag with Object URL */}
      <video
        ref={videoRef}
        src={objectUrl}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onError={() => onError?.('خطا در پخش فایل ویدیوی محلی')}
        className="w-full h-full object-contain cursor-pointer"
        onClick={handleTogglePlay}
      />

      {/* Center Buffering / Play Indicator */}
      <AnimatePresence>
        {isBuffering && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute z-20 flex items-center justify-center p-4 bg-black/60 rounded-2xl backdrop-blur-md pointer-events-none"
          >
            <Loader2 className="h-10 w-10 text-rose-500 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Overlay: Live Broadcast Badge & File Title */}
      <div
        className={`absolute top-0 inset-x-0 p-4 z-30 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2.5">
          {/* Live Streaming Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-bold shadow-lg shadow-rose-500/10 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span>در حال پخش زنده برای اعضای اتاق (P2P Mesh)</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900/80 border border-zinc-700/60 text-zinc-300 text-xs backdrop-blur-md">
            <Film className="h-3.5 w-3.5 text-zinc-400" />
            <span>فایل اصلی در کامپیوتر شما</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1 rounded-xl bg-zinc-900/80 border border-zinc-700/60 text-zinc-300 text-xs font-mono dir-ltr truncate max-w-[240px] backdrop-blur-md">
            {fileName}
          </div>
        </div>
      </div>

      {/* Transient Feedback Toast */}
      <AnimatePresence>
        {syncFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 bg-zinc-900/95 border border-zinc-700 text-zinc-200 text-xs rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2"
          >
            <Sparkles className="h-3.5 w-3.5 text-rose-400" />
            <span>{syncFeedback}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 p-4 z-30 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Progress Timeline */}
        <div className="mb-2">
          <ProgressBar
            currentTime={currentTime}
            duration={duration}
            bufferedTime={bufferedTime}
            onSeek={handleSeek}
            disabled={!canControlVideo && !allowAnyoneControl && !isHost}
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {/* Left Controls: Play/Pause, Volume, Time Display */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="p-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
              title={isPlaying ? 'توقف' : 'پخش'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            </button>

            <VolumeControl
              volume={volume}
              isMuted={isMuted}
              onVolumeChange={handleVolumeChange}
              onToggleMute={handleToggleMute}
            />

            <div className="text-xs text-zinc-300 font-mono select-none dir-ltr">
              <span>{formatVideoTime(currentTime)}</span>
              <span className="text-zinc-500 mx-1">/</span>
              <span>{formatVideoTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Playback Rate & Fullscreen */}
          <div className="flex items-center gap-2">
            <QualityMenu
              currentQuality="1080p"
              playbackRate={playbackRate}
              onPlaybackRateChange={handlePlaybackRateChange}
            />

            <FullscreenButton
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
