import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
  User,
  Film,
  Sparkles,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Volume1,
  FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useRoom } from '../../hooks/useRoom';
import { webRTCManager } from '../../services/webRTCManager';

export interface RemoteMoviePlayerProps {
  key?: React.Key;
  stream: MediaStream | null;
  fileName?: string;
  ownerName?: string;
  onOpenSourcePanel?: () => void;
}

export function RemoteMoviePlayer({
  stream,
  fileName = 'فایل ویدیوی سیستم',
  ownerName = 'یکی از اعضا',
  onOpenSourcePanel
}: RemoteMoviePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    canControlVideo,
    allowAnyoneControl,
    isHost,
    sendMovieControl,
    sendMovieSeek
  } = useRoom();

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(0.9);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [hasVideoTrack, setHasVideoTrack] = useState<boolean>(false);
  const [hasAudioTrack, setHasAudioTrack] = useState<boolean>(false);
  const [streamConnecting, setStreamConnecting] = useState<boolean>(true);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Show transient feedback message
  const showToast = useCallback((msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => {
      setFeedbackToast((prev) => (prev === msg ? null : prev));
    }, 2500);
  }, []);

  // Attach remote stream to HTMLVideoElement
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;

      const vTracks = stream.getVideoTracks();
      const aTracks = stream.getAudioTracks();

      setHasVideoTrack(vTracks.length > 0);
      setHasAudioTrack(aTracks.length > 0);
      setStreamConnecting(vTracks.length === 0);

      const handleTrackAdded = () => {
        setHasVideoTrack(stream.getVideoTracks().length > 0);
        setHasAudioTrack(stream.getAudioTracks().length > 0);
        setStreamConnecting(false);
      };

      stream.addEventListener('addtrack', handleTrackAdded);
      stream.addEventListener('removetrack', handleTrackAdded);

      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
          setStreamConnecting(false);
        })
        .catch((err) => {
          console.warn('[RemoteMoviePlayer] Autoplay with audio was prevented, trying muted:', err);
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => {
              setIsPlaying(true);
              setAutoplayBlocked(true);
              setStreamConnecting(false);
            })
            .catch(() => {
              setIsPlaying(false);
              setAutoplayBlocked(true);
            });
        });

      return () => {
        stream.removeEventListener('addtrack', handleTrackAdded);
        stream.removeEventListener('removetrack', handleTrackAdded);
      };
    } else {
      video.srcObject = null;
      setStreamConnecting(true);
    }
  }, [stream]);

  // Handle Fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.error('Fullscreen toggle failed', e);
    }
  };

  // Auto-hide controls
  const triggerControlsShow = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  // Update volume & mute on video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

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
    if (autoplayBlocked) {
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.play().catch(() => {});
      }
      setIsMuted(false);
      setAutoplayBlocked(false);
      return;
    }
    setIsMuted(!isMuted);
  };

  // Movie stream control requests
  const handleRequestPlay = () => {
    sendMovieControl('play');
    showToast('درخواست شروع پخش ارسال شد');
  };

  const handleRequestPause = () => {
    sendMovieControl('pause');
    showToast('درخواست توقف پخش ارسال شد');
  };

  const handleUnblockAudio = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
    setIsMuted(false);
    setAutoplayBlocked(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControlsShow}
      onMouseEnter={triggerControlsShow}
      className="relative flex items-center justify-center w-full h-full bg-black overflow-hidden select-none group"
      id="remote-movie-player-container"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        onLoadedMetadata={() => {
          setStreamConnecting(false);
          setHasVideoTrack(true);
        }}
        onCanPlay={() => {
          setStreamConnecting(false);
          setHasVideoTrack(true);
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setStreamConnecting(false);
          setHasVideoTrack(true);
        }}
        className="w-full h-full object-contain"
      />

      {/* Connecting / Buffering Placeholder */}
      <AnimatePresence>
        {(!stream || streamConnecting || !hasVideoTrack) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b0d14]/90 backdrop-blur-md p-6 text-center"
          >
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center shadow-2xl text-rose-400">
                <Film className="h-8 w-8 text-rose-500 animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 bg-zinc-950 border border-zinc-700 rounded-lg text-emerald-400">
                <Radio className="h-4 w-4 animate-spin text-rose-500" />
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono mb-3">
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="truncate max-w-[260px] dir-ltr">{fileName}</span>
            </div>

            <h3 className="text-base font-bold text-zinc-100 mb-1">
              در حال دریافت استریم زنده از {ownerName}
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed mb-4">
              اتصال WebRTC مستقیم برقرار است و پخش زنده فایل به زودی آغاز خواهد شد...
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                <span>در حال برقراری جریان مدیا (WebRTC Mesh)...</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.play().catch(() => {});
                  }
                  showToast('در حال تلاش مجدد برای اتصال WebRTC...');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/80 text-zinc-200 text-xs rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 text-rose-400" />
                <span>تلاش مجدد اتصال</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Overlay: Live Badge & Stream Info */}
      <div
        className={`absolute top-0 inset-x-0 p-4 z-30 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-bold shadow-lg shadow-rose-500/10 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span>استریم زنده محلی (P2P)</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-zinc-700/60 text-zinc-300 text-xs backdrop-blur-md">
            <User className="h-3.5 w-3.5 text-zinc-400" />
            <span>پخش‌کننده: {ownerName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-zinc-700/60 text-zinc-300 text-xs font-mono dir-ltr truncate max-w-[200px] backdrop-blur-md">
            {fileName}
          </div>
        </div>
      </div>

      {/* Autoplay Blocked Banner */}
      {autoplayBlocked && (
        <div className="absolute top-16 inset-x-4 z-30 flex items-center justify-between p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl backdrop-blur-md text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <VolumeX className="h-4 w-4 text-amber-400" />
            <span>صدای ویدیو توسط مرورگر بی‌صدا شده است. برای شنیدن صدا کلیک کنید.</span>
          </div>
          <button
            type="button"
            onClick={handleUnblockAudio}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg text-xs transition-colors cursor-pointer"
          >
            فعال‌سازی صدا
          </button>
        </div>
      )}

      {/* Transient feedback toast */}
      <AnimatePresence>
        {feedbackToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 bg-zinc-900/95 border border-zinc-700 text-zinc-200 text-xs rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2"
          >
            <Sparkles className="h-3.5 w-3.5 text-rose-400" />
            <span>{feedbackToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 p-4 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left Controls: Play Request & Stream Controls */}
          <div className="flex items-center gap-3">
            {(canControlVideo || allowAnyoneControl || isHost) && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRequestPlay}
                  title="درخواست پخش"
                  className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-all cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRequestPause}
                  title="درخواست توقف"
                  className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60 transition-all cursor-pointer"
                >
                  <Pause className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="p-2 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title={isMuted ? 'فعال‌سازی صدا' : 'بی‌صدا'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-16 sm:w-24 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>
          </div>

          {/* Right Controls: Live Tag & Fullscreen */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>همگام‌سازی بی‌درنگ WebRTC</span>
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              title={isFullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
