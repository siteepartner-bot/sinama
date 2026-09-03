import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, VolumeX, CheckCircle2, Play, Pause, RotateCcw, RotateCw, UploadCloud } from 'lucide-react';
import { VideoControls } from './VideoControls';
import { VideoError } from './VideoError';
import { SubtitleMenu } from './SubtitleMenu';
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';
import { AspectRatioType } from './QualityMenu';
import { SubtitleCue, getActiveSubtitleText } from '../../utils/subtitleParser';

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
  onFileDrop?: (file: File) => void;
}

export function DirectVideoPlayer({
  src,
  title = 'پلیر اختصاصی واچ‌پارتی',
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
  onFileDrop,
}: DirectVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState<boolean>(initialPlayState);
  const [currentTime, setCurrentTime] = useState<number>(targetTime);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedTime, setBufferedTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1.0); // 0 to 2 (1 = 100%, 2 = 200%)
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(externalPlaybackRate);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('contain');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Gesture & Pulse feedback states
  const [actionPulse, setActionPulse] = useState<'play' | 'pause' | 'backward' | 'forward' | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Subtitles State
  const [isSubtitleMenuOpen, setIsSubtitleMenuOpen] = useState<boolean>(false);
  const [isSubtitlesEnabled, setIsSubtitlesEnabled] = useState<boolean>(true);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleTitle, setSubtitleTitle] = useState<string>('');
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const [subtitleFontSize, setSubtitleFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Keyboard Shortcuts Modal State
  const [isKeyboardModalOpen, setIsKeyboardModalOpen] = useState<boolean>(false);

  // Sync Drift Tracker
  const [syncDriftMs, setSyncDriftMs] = useState<number>(0);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);

  // Web Audio API Gain Node for Volume Boost (100% to 200%)
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

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

  // Toast feedback helper
  const showFeedbackToast = useCallback((msg: string) => {
    setSyncFeedback(msg);
    setTimeout(() => {
      setSyncFeedback((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Web Audio API Setup for Volume Boost
  const setupAudioBoost = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const gain = ctx.createGain();
        const srcNode = ctx.createMediaElementSource(video);
        srcNode.connect(gain);
        gain.connect(ctx.destination);

        audioContextRef.current = ctx;
        gainNodeRef.current = gain;
        mediaSourceNodeRef.current = srcNode;
      }
    } catch {
      // Browsers may restrict createMediaElementSource for cross-origin videos without CORS headers
      // Falls back to standard HTML5 volume
    }
  }, []);

  // Handle Volume and Volume Boost
  const handleVolumeChange = useCallback((newVol: number) => {
    const clampedVol = Math.max(0, Math.min(2.0, newVol));
    setVolume(clampedVol);

    if (clampedVol > 0 && isMuted) {
      setIsMuted(false);
    } else if (clampedVol === 0) {
      setIsMuted(true);
    }
    setAutoplayBlocked(false);

    const video = videoRef.current;
    if (!video) return;

    // Normal audio range (0.0 to 1.0)
    video.volume = Math.min(1.0, clampedVol);

    // Boost range (1.0 to 2.0)
    if (clampedVol > 1.0) {
      setupAudioBoost();
      if (audioContextRef.current && gainNodeRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
        gainNodeRef.current.gain.value = clampedVol;
      }
    } else if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = 1.0;
    }
  }, [isMuted, setupAudioBoost]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
    setAutoplayBlocked(false);
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
        if (targetTime !== undefined && Math.abs(video.currentTime - targetTime) > 0.35) {
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
            console.warn('Autoplay blocked, falling back to muted:', err);
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

    // 2. Remote Seek Event & Drift Correction
    if (isNewEvent && targetTime !== undefined) {
      const drift = Math.abs(video.currentTime - targetTime);
      setSyncDriftMs(Math.round((video.currentTime - targetTime) * 1000));

      if (drift > 0.35) {
        suppressSeekBroadcast.current++;
        video.currentTime = targetTime;
        setCurrentTime(targetTime);
      }
    }

    // 3. Playback Rate Synchronization
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
      videoRef.current.volume = Math.min(1.0, volume);
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Trigger brief visual pulse icon
  const triggerPulse = (action: 'play' | 'pause' | 'backward' | 'forward') => {
    setActionPulse(action);
    setTimeout(() => {
      setActionPulse((curr) => (curr === action ? null : curr));
    }, 600);
  };

  // Handle Play/Pause by local user action
  const handleTogglePlay = useCallback(() => {
    if (!canControlVideo) {
      showFeedbackToast('کنترل ویدیو در انحصار مالک اتاق است');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (isEnded) {
      video.currentTime = 0;
      setIsEnded(false);
    }

    if (video.paused) {
      triggerPulse('play');
      video.play().catch((e) => {
        console.warn('Play request failed:', e);
        setIsPlaying(false);
      });
    } else {
      triggerPulse('pause');
      video.pause();
    }
  }, [isEnded, canControlVideo, showFeedbackToast]);

  // Handle Seek by local user action
  const handleSeek = useCallback((time: number) => {
    if (!canControlVideo) {
      showFeedbackToast('کنترل ویدیو در انحصار مالک اتاق است');
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const clampedTime = Math.max(0, Math.min(time, duration > 0 ? duration : Infinity));
    video.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    setIsEnded(false);
  }, [duration, canControlVideo, showFeedbackToast]);

  // Frame Stepping (when paused)
  const handleStepFrame = useCallback((forward: boolean) => {
    if (!canControlVideo) return;
    const video = videoRef.current;
    if (!video || !video.paused) return;

    const frameDuration = 0.04; // ~1/25th sec
    const newTime = forward
      ? Math.min(duration || Infinity, video.currentTime + frameDuration)
      : Math.max(0, video.currentTime - frameDuration);

    handleSeek(newTime);
  }, [canControlVideo, duration, handleSeek]);

  // Handle Manual Force Resync
  const handleForceResync = useCallback(() => {
    const video = videoRef.current;
    if (!video || targetTime === undefined) return;

    setIsManualSyncing(true);
    suppressSeekBroadcast.current++;
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    setSyncDriftMs(0);

    if (initialPlayState && video.paused) {
      suppressPlayBroadcast.current++;
      video.play().catch(() => {});
    }

    showFeedbackToast('ویدیو با زمان اتاق همگام شد');
    setTimeout(() => setIsManualSyncing(false), 600);
  }, [targetTime, initialPlayState, showFeedbackToast]);

  // Handle Playback Rate change by local user action
  const handlePlaybackRateChange = useCallback((rate: number) => {
    if (!canControlVideo) {
      showFeedbackToast('کنترل ویدیو در انحصار مالک اتاق است');
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, [canControlVideo, showFeedbackToast]);

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

  // Keyboard Shortcuts (Space, K, J, L, Arrow Left, Arrow Right, M, F, C, S, 0-9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          handleTogglePlay();
          break;

        case 'j':
        case 'J':
          e.preventDefault();
          triggerPulse('backward');
          handleSeek(Math.max(0, video.currentTime - 10));
          break;

        case 'l':
        case 'L':
          e.preventDefault();
          triggerPulse('forward');
          handleSeek(Math.min(duration || Infinity, video.currentTime + 10));
          break;

        case 'ArrowLeft':
          e.preventDefault();
          triggerPulse('backward');
          handleSeek(Math.max(0, video.currentTime - 5));
          break;

        case 'ArrowRight':
          e.preventDefault();
          triggerPulse('forward');
          handleSeek(Math.min(duration || Infinity, video.currentTime + 5));
          break;

        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange(Math.min(2.0, volume + 0.05));
          break;

        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.05));
          break;

        case 'm':
        case 'M':
          e.preventDefault();
          handleToggleMute();
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          handleToggleFullscreen();
          break;

        case 'c':
        case 'C':
          e.preventDefault();
          setIsSubtitlesEnabled((prev) => !prev);
          break;

        case 's':
        case 'S':
          e.preventDefault();
          handleForceResync();
          break;

        case ',':
        case '<':
          if (video.paused) {
            e.preventDefault();
            handleStepFrame(false);
          }
          break;

        case '.':
        case '>':
          if (video.paused) {
            e.preventDefault();
            handleStepFrame(true);
          }
          break;

        // Number keys 0-9 jump to 0% - 90%
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          if (duration > 0 && canControlVideo) {
            e.preventDefault();
            const percent = parseInt(e.key, 10) / 10;
            handleSeek(duration * percent);
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleTogglePlay,
    handleSeek,
    handleStepFrame,
    handleForceResync,
    handleVolumeChange,
    handleToggleMute,
    duration,
    volume,
    canControlVideo
  ]);

  // Click & Double click video canvas gestures
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleVideoAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks on controls or popovers
    if ((e.target as HTMLElement).closest('#custom-video-controls') || (e.target as HTMLElement).closest('#subtitle-settings-popover')) {
      return;
    }

    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    const clickX = e.clientX - (rect?.left || 0);
    const width = rect?.width || 1;

    if (now - lastClickTimeRef.current < 300) {
      // Double Click detected
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      // Check if double click was on left 35%, right 35%, or middle 30%
      const ratio = clickX / width;
      if (ratio < 0.35) {
        // Double click left side: Jump -10s
        triggerPulse('backward');
        handleSeek(Math.max(0, currentTime - 10));
      } else if (ratio > 0.65) {
        // Double click right side: Jump +10s
        triggerPulse('forward');
        handleSeek(Math.min(duration || Infinity, currentTime + 10));
      } else {
        // Center double click: toggle fullscreen
        handleToggleFullscreen();
      }
    } else {
      // Single Click: toggle play after small debounce
      lastClickTimeRef.current = now;
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = setTimeout(() => {
        handleTogglePlay();
      }, 250);
    }
  };

  // Drag & drop file directly onto video player
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
        // Load dropped subtitle
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) {
            import('../../utils/subtitleParser').then(({ parseSubtitleContent }) => {
              const cues = parseSubtitleContent(text);
              setSubtitleCues(cues);
              setSubtitleTitle(file.name);
              setIsSubtitlesEnabled(true);
              showFeedbackToast(`زیرنویس «${file.name}» بارگذاری شد`);
            });
          }
        };
        reader.readAsText(file);
      } else if (onFileDrop) {
        onFileDrop(file);
      }
    }
  };

  // Video Native Event Handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);

    // Calculate live drift
    if (targetTime !== undefined && isPlaying) {
      const drift = Math.round((video.currentTime - targetTime) * 1000);
      setSyncDriftMs(drift);
    }

    // Update buffered progress
    if (video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBufferedTime(bufferedEnd);
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    setDuration(video.duration || 0);
    setIsBuffering(false);
    setHasError(false);

    if (targetTime > 0) {
      suppressSeekBroadcast.current++;
      video.currentTime = targetTime;
      setCurrentTime(targetTime);
    }

    if (initialPlayState) {
      suppressPlayBroadcast.current++;
      video.play().catch(() => {});
    }
  };

  const handlePlayEvent = () => {
    setIsPlaying(true);
    setIsEnded(false);
    setIsBuffering(false);

    if (suppressPlayBroadcast.current > 0) {
      suppressPlayBroadcast.current--;
      return;
    }

    if (onPlayChange && videoRef.current) {
      onPlayChange(true, videoRef.current.currentTime);
    }
  };

  const handlePauseEvent = () => {
    setIsPlaying(false);
    setIsBuffering(false);

    if (suppressPauseBroadcast.current > 0) {
      suppressPauseBroadcast.current--;
      return;
    }

    if (onPlayChange && videoRef.current) {
      onPlayChange(false, videoRef.current.currentTime);
    }
  };

  const handleSeekedEvent = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);
    setIsBuffering(false);

    if (suppressSeekBroadcast.current > 0) {
      suppressSeekBroadcast.current--;
      return;
    }

    if (onSeekChange) {
      onSeekChange(video.currentTime);
    }
  };

  const handleRateChangeEvent = () => {
    const video = videoRef.current;
    if (!video) return;

    setPlaybackRate(video.playbackRate);

    if (suppressRateBroadcast.current > 0) {
      suppressRateBroadcast.current--;
      return;
    }

    if (onRateChange) {
      onRateChange(video.playbackRate);
    }
  };

  const handleEndedEvent = () => {
    setIsEnded(true);
    setIsPlaying(false);
    if (onEnded) {
      onEnded();
    }
  };

  const handleErrorEvent = () => {
    const video = videoRef.current;
    let message = 'خطا در بارگذاری فایل یا استریم ویدیو.';
    if (video && video.error) {
      switch (video.error.code) {
        case 1:
          message = 'پخش ویدیو توسط مرورگر متوقف شد.';
          break;
        case 2:
          message = 'خطای اتصال به شبکه هنگام دریافت ویدیو رخ داد.';
          break;
        case 3:
          message = 'فایل ویدیویی خراب است یا فرمت آن پشتیبانی نمی‌شود.';
          break;
        case 4:
          message = 'آدرس ویدیو یافت نشد یا سرور اجازه دسترسی (CORS) نداد.';
          break;
        default:
          break;
      }
    }
    setHasError(true);
    setErrorMessage(message);
    setIsBuffering(false);
    if (onError) onError(message);
  };

  const handleRetry = () => {
    setHasError(false);
    setErrorMessage('');
    setIsBuffering(true);
    if (videoRef.current) {
      videoRef.current.load();
    }
  };

  const handleUnblockAudio = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = false;
    setIsMuted(false);
    setAutoplayBlocked(false);
    handleVolumeChange(volume);
  };

  // Calculate live active subtitle cue
  const activeSubtitle = isSubtitlesEnabled
    ? getActiveSubtitleText(subtitleCues, currentTime, subtitleOffset)
    : null;

  // Derive aspect ratio CSS
  const getAspectRatioClasses = () => {
    switch (aspectRatio) {
      case 'cover':
        return 'w-full h-full object-cover';
      case '16:9':
        return 'w-full h-full object-contain aspect-video';
      case '21:9':
        return 'w-full h-full object-cover aspect-[21/9]';
      case '4:3':
        return 'w-full h-full object-contain aspect-[4/3]';
      case 'contain':
      default:
        return 'w-full h-full object-contain';
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControlsShow}
      onMouseEnter={triggerControlsShow}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={handleVideoAreaClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex items-center justify-center w-full h-full bg-black overflow-hidden select-none group/player"
      id="custom-dedicated-player"
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        crossOrigin="anonymous"
        className={getAspectRatioClasses()}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlayEvent}
        onPause={handlePauseEvent}
        onSeeked={handleSeekedEvent}
        onRateChange={handleRateChangeEvent}
        onEnded={handleEndedEvent}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={handleErrorEvent}
      />

      {/* Drag & Drop Overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-rose-950/80 border-2 border-dashed border-rose-400 z-40 flex flex-col items-center justify-center text-white backdrop-blur-sm pointer-events-none">
          <UploadCloud className="h-14 w-14 text-rose-300 animate-bounce mb-3" />
          <h3 className="text-base font-bold">فایل را رها کنید</h3>
          <p className="text-xs text-rose-200 mt-1">پشتیبانی از فرمت‌های ویدیویی (MP4/MKV) و زیرنویس (SRT/VTT)</p>
        </div>
      )}

      {/* Center Action Pulse (Play, Pause, -10s, +10s) */}
      <AnimatePresence>
        {actionPulse && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1.15 }}
            exit={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute z-20 pointer-events-none p-5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-2xl"
          >
            {actionPulse === 'play' && <Play className="h-10 w-10 fill-white ml-0.5 text-white" />}
            {actionPulse === 'pause' && <Pause className="h-10 w-10 text-white" />}
            {actionPulse === 'backward' && (
              <div className="flex flex-col items-center">
                <RotateCcw className="h-9 w-9 text-white" />
                <span className="text-[11px] font-bold font-mono mt-1">-10s</span>
              </div>
            )}
            {actionPulse === 'forward' && (
              <div className="flex flex-col items-center">
                <RotateCw className="h-9 w-9 text-white" />
                <span className="text-[11px] font-bold font-mono mt-1">+10s</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Subtitle Overlay */}
      <AnimatePresence>
        {activeSubtitle && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-20 text-center pointer-events-none select-none max-w-[85%] sm:max-w-[80%] transition-all ${
              showControls ? 'bottom-20 sm:bottom-24' : 'bottom-6 sm:bottom-10'
            }`}
            id="active-subtitle-overlay"
          >
            <div
              className={`inline-block px-4 py-1.5 rounded-xl bg-black/85 text-white font-medium shadow-2xl border border-white/10 backdrop-blur-xs leading-relaxed whitespace-pre-line ${
                subtitleFontSize === 'small'
                  ? 'text-xs sm:text-sm'
                  : subtitleFontSize === 'large'
                  ? 'text-base sm:text-xl font-bold'
                  : 'text-sm sm:text-base font-semibold'
              }`}
              style={{
                textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)',
              }}
            >
              {activeSubtitle}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buffering Spinner */}
      {isBuffering && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 pointer-events-none z-20">
          <Loader2 className="h-10 w-10 text-rose-500 animate-spin mb-2" />
          <span className="text-xs font-semibold text-zinc-300 bg-black/60 px-3 py-1 rounded-full border border-zinc-800">
            در حال دریافت استریم...
          </span>
        </div>
      )}

      {/* Autoplay blocked sound banner */}
      {autoplayBlocked && isPlaying && (
        <button
          type="button"
          onClick={handleUnblockAudio}
          className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-full shadow-2xl backdrop-blur-md cursor-pointer z-30 transition-all hover:scale-105"
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

      {/* Subtitle Menu Popover */}
      <SubtitleMenu
        isOpen={isSubtitleMenuOpen}
        onClose={() => setIsSubtitleMenuOpen(false)}
        isEnabled={isSubtitlesEnabled}
        onToggleEnabled={() => setIsSubtitlesEnabled((prev) => !prev)}
        currentCues={subtitleCues}
        onSetCues={(cues, titleText) => {
          setSubtitleCues(cues);
          if (titleText) setSubtitleTitle(titleText);
          showFeedbackToast(cues.length > 0 ? `زیرنویس بارگذاری شد (${cues.length} بخش)` : 'زیرنویس حذف شد');
        }}
        subtitleTitle={subtitleTitle}
        offsetSeconds={subtitleOffset}
        onOffsetChange={setSubtitleOffset}
        fontSize={subtitleFontSize}
        onFontSizeChange={setSubtitleFontSize}
      />

      {/* Keyboard Shortcuts Help Modal */}
      <KeyboardShortcutsModal
        isOpen={isKeyboardModalOpen}
        onClose={() => setIsKeyboardModalOpen(false)}
      />

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
          aspectRatio={aspectRatio}
          videoTitle={title}
          showControls={showControls}
          isFullscreen={isFullscreen}
          canControlVideo={canControlVideo}
          isHost={isHost}
          allowAnyoneControl={allowAnyoneControl}
          syncDriftMs={syncDriftMs}
          isSyncing={isManualSyncing}
          hasSubtitles={subtitleCues.length > 0}
          isSubtitlesEnabled={isSubtitlesEnabled}
          onOpenSubtitleSettings={() => setIsSubtitleMenuOpen(true)}
          onOpenKeyboardHelp={() => setIsKeyboardModalOpen(true)}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onStepFrame={handleStepFrame}
          onForceResync={handleForceResync}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onPlaybackRateChange={handlePlaybackRateChange}
          onAspectRatioChange={setAspectRatio}
          onToggleFullscreen={handleToggleFullscreen}
          onTogglePiP={handleTogglePiP}
        />
      )}
    </div>
  );
}
