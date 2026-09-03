import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
  Lock,
  Users,
  Crown,
  Subtitles,
  Keyboard,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ProgressBar } from './ProgressBar';
import { VolumeControl } from './VolumeControl';
import { QualityMenu, AspectRatioType } from './QualityMenu';
import { FullscreenButton } from './FullscreenButton';
import { formatVideoTime } from '../../utils/mediaParsers';

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferedTime?: number;
  volume: number;
  isMuted: boolean;
  quality?: string;
  availableQualities?: string[];
  playbackRate?: number;
  aspectRatio?: AspectRatioType;
  videoTitle?: string;
  showControls?: boolean;
  isFullscreen?: boolean;
  canControlVideo?: boolean;
  isHost?: boolean;
  allowAnyoneControl?: boolean;
  syncDriftMs?: number;
  isSyncing?: boolean;
  // Subtitles
  hasSubtitles?: boolean;
  isSubtitlesEnabled?: boolean;
  onOpenSubtitleSettings?: () => void;
  // Keyboard help
  onOpenKeyboardHelp?: () => void;
  // Actions
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onStepFrame?: (forward: boolean) => void;
  onForceResync?: () => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onQualityChange?: (quality: string) => void;
  onPlaybackRateChange?: (rate: number) => void;
  onAspectRatioChange?: (ratio: AspectRatioType) => void;
  onToggleFullscreen: () => void;
  onTogglePiP?: () => void;
}

export function VideoControls({
  isPlaying,
  currentTime,
  duration,
  bufferedTime = 0,
  volume,
  isMuted,
  quality = '1080p',
  availableQualities,
  playbackRate = 1,
  aspectRatio = 'contain',
  videoTitle = 'پخش اختصاصی واچ‌پارتی',
  showControls = true,
  isFullscreen = false,
  canControlVideo = true,
  isHost = false,
  allowAnyoneControl = true,
  syncDriftMs = 0,
  isSyncing = false,
  hasSubtitles = false,
  isSubtitlesEnabled = false,
  onOpenSubtitleSettings,
  onOpenKeyboardHelp,
  onTogglePlay,
  onSeek,
  onStepFrame,
  onForceResync,
  onVolumeChange,
  onToggleMute,
  onQualityChange,
  onPlaybackRateChange,
  onAspectRatioChange,
  onToggleFullscreen,
  onTogglePiP,
}: VideoControlsProps) {
  const supportsPiP = typeof document !== 'undefined' && document.pictureInPictureEnabled;
  const absDrift = Math.abs(syncDriftMs);

  return (
    <AnimatePresence>
      {showControls && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/95 via-black/25 to-black/70 p-3 sm:p-5 md:p-6 select-none z-20 pointer-events-auto"
          id="custom-video-controls"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar: Title & Status Badges */}
          <div className="flex items-center justify-between gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0 max-w-[60%] sm:max-w-[70%]">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="text-xs font-semibold text-zinc-400 shrink-0 hidden sm:inline">در حال تماشا:</span>
              <h4 className="text-xs sm:text-sm font-bold text-zinc-100 truncate" title={videoTitle}>
                {videoTitle}
              </h4>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Force Resync Button & Drift Indicator */}
              {onForceResync && (
                <button
                  type="button"
                  onClick={onForceResync}
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-mono border transition-all cursor-pointer ${
                    absDrift > 600
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                      : 'bg-black/50 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                  }`}
                  title="کلیک برای همگام‌سازی سریع فریم ویدیو با اتاق"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden md:inline">
                    {absDrift > 600 ? 'نیاز به سنک' : 'همگام'} ({absDrift}ms)
                  </span>
                  <span className="md:hidden">سنک</span>
                </button>
              )}

              {/* Room Permission Badge */}
              {allowAnyoneControl ? (
                <div className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-emerald-500/20 backdrop-blur-md rounded-full border border-emerald-500/30 text-[10px] sm:text-[11px] font-medium text-emerald-300">
                  <Users className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline">کنترل آزاد</span>
                </div>
              ) : isHost ? (
                <div className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-amber-500/20 backdrop-blur-md rounded-full border border-amber-500/30 text-[10px] sm:text-[11px] font-medium text-amber-300">
                  <Crown className="h-3 w-3 text-amber-400 shrink-0" />
                  <span>میزبان</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 bg-rose-500/20 backdrop-blur-md rounded-full border border-rose-500/30 text-[10px] sm:text-[11px] font-medium text-rose-300">
                  <Lock className="h-3 w-3 text-rose-400 shrink-0" />
                  <span>فقط مالک</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Controls Bar */}
          <div className="flex flex-col gap-2 mt-auto">
            {/* Seek / Progress Bar */}
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              bufferedTime={bufferedTime}
              onSeek={onSeek}
              disabled={!canControlVideo}
            />

            {/* Actions Bar */}
            <div className="flex items-center justify-between text-zinc-100 flex-wrap gap-y-2">
              {/* Left Group (Play, Skip, Time, Volume) */}
              <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3">
                {/* Skip Backward 10s */}
                <button
                  type="button"
                  onClick={() => canControlVideo && onSeek(Math.max(0, currentTime - 10))}
                  disabled={!canControlVideo}
                  className={`p-1.5 rounded-lg transition-all ${
                    canControlVideo
                      ? 'text-zinc-300 hover:text-white hover:bg-zinc-800/80 cursor-pointer active:scale-95'
                      : 'text-zinc-600 cursor-not-allowed opacity-50'
                  }`}
                  title={canControlVideo ? '۱۰ ثانیه عقب (کلید J یا جهت چپ)' : 'کنترل ویدیو در انحصار مالک اتاق است'}
                  id="btn-skip-backward-10"
                >
                  <RotateCcw className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </button>

                {/* Frame Step Backward (Only when paused) */}
                {!isPlaying && onStepFrame && canControlVideo && (
                  <button
                    type="button"
                    onClick={() => onStepFrame(false)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer hidden md:inline-flex"
                    title="یک فریم به عقب (<)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}

                {/* Play / Pause Toggle */}
                <button
                  type="button"
                  onClick={() => canControlVideo && onTogglePlay()}
                  disabled={!canControlVideo}
                  className={`p-2 rounded-xl transition-all shadow-md ${
                    canControlVideo
                      ? 'bg-rose-500 hover:bg-rose-600 text-white cursor-pointer shadow-rose-500/20 active:scale-95'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none opacity-60'
                  }`}
                  title={
                    !canControlVideo
                      ? 'کنترل ویدیو توسط مالک محدود شده است'
                      : isPlaying
                      ? 'توقف موقت (Space / K)'
                      : 'پخش (Space / K)'
                  }
                  id="btn-play-pause"
                >
                  {!canControlVideo ? (
                    <Lock className="h-4.5 w-4.5 text-zinc-400" />
                  ) : isPlaying ? (
                    <Pause className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                  ) : (
                    <Play className="h-4.5 w-4.5 sm:h-5 sm:w-5 fill-white ml-0.5" />
                  )}
                </button>

                {/* Frame Step Forward (Only when paused) */}
                {!isPlaying && onStepFrame && canControlVideo && (
                  <button
                    type="button"
                    onClick={() => onStepFrame(true)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors cursor-pointer hidden md:inline-flex"
                    title="یک فریم به جلو (>)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}

                {/* Skip Forward 10s */}
                <button
                  type="button"
                  onClick={() => canControlVideo && onSeek(Math.min(duration || Infinity, currentTime + 10))}
                  disabled={!canControlVideo}
                  className={`p-1.5 rounded-lg transition-all ${
                    canControlVideo
                      ? 'text-zinc-300 hover:text-white hover:bg-zinc-800/80 cursor-pointer active:scale-95'
                      : 'text-zinc-600 cursor-not-allowed opacity-50'
                  }`}
                  title={canControlVideo ? '۱۰ ثانیه جلو (کلید L یا جهت راست)' : 'کنترل ویدیو در انحصار مالک اتاق است'}
                  id="btn-skip-forward-10"
                >
                  <RotateCw className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </button>

                {/* Current / Duration Time */}
                <div className="text-[11px] sm:text-xs font-mono text-zinc-300 select-none flex items-center" dir="ltr" id="player-time-display">
                  <span className="text-zinc-100 font-semibold">{formatVideoTime(currentTime)}</span>
                  <span className="mx-1 text-zinc-500">/</span>
                  <span className="text-zinc-400">{formatVideoTime(duration)}</span>
                </div>

                {/* Volume & Mute */}
                <VolumeControl
                  volume={volume}
                  isMuted={isMuted}
                  onVolumeChange={onVolumeChange}
                  onToggleMute={onToggleMute}
                />
              </div>

              {/* Right Group (Subtitles, Keyboard Guide, PiP, Settings/Speed/Aspect, Fullscreen) */}
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Subtitles Button (CC) */}
                {onOpenSubtitleSettings && (
                  <button
                    type="button"
                    onClick={onOpenSubtitleSettings}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer relative ${
                      isSubtitlesEnabled && hasSubtitles
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
                    }`}
                    title="تنظیمات و بارگذاری زیرنویس (کلید C)"
                    id="btn-toggle-subtitles"
                  >
                    <Subtitles className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                    {isSubtitlesEnabled && hasSubtitles && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500" />
                    )}
                  </button>
                )}

                {/* Keyboard Shortcuts Dialog Trigger */}
                {onOpenKeyboardHelp && (
                  <button
                    type="button"
                    onClick={onOpenKeyboardHelp}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer hidden sm:inline-flex"
                    title="راهنمای کلیدهای میانبر"
                    id="btn-keyboard-shortcuts-help"
                  >
                    <Keyboard className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                  </button>
                )}

                {/* Picture in Picture */}
                {supportsPiP && onTogglePiP && (
                  <button
                    type="button"
                    onClick={onTogglePiP}
                    className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer select-none"
                    title="تصویر در تصویر (PiP)"
                    id="btn-toggle-pip"
                  >
                    <PictureInPicture2 className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                  </button>
                )}

                {/* Quality, Speed & Aspect Ratio Menu */}
                <QualityMenu
                  currentQuality={quality}
                  availableQualities={availableQualities}
                  playbackRate={playbackRate}
                  aspectRatio={aspectRatio}
                  onQualityChange={onQualityChange}
                  onPlaybackRateChange={canControlVideo ? onPlaybackRateChange : undefined}
                  onAspectRatioChange={onAspectRatioChange}
                />

                {/* Fullscreen Button */}
                <FullscreenButton
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={onToggleFullscreen}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
