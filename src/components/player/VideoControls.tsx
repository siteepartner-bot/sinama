import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, PictureInPicture2 } from 'lucide-react';
import { ProgressBar } from './ProgressBar';
import { VolumeControl } from './VolumeControl';
import { QualityMenu } from './QualityMenu';
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
  videoTitle?: string;
  showControls?: boolean;
  isFullscreen?: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onQualityChange?: (quality: string) => void;
  onPlaybackRateChange?: (rate: number) => void;
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
  videoTitle = 'پخش ویدیو',
  showControls = true,
  isFullscreen = false,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onQualityChange,
  onPlaybackRateChange,
  onToggleFullscreen,
  onTogglePiP,
}: VideoControlsProps) {
  const supportsPiP = typeof document !== 'undefined' && document.pictureInPictureEnabled;

  return (
    <AnimatePresence>
      {showControls && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/90 via-black/20 to-black/60 p-4 md:p-6 select-none z-20 pointer-events-auto"
          id="custom-video-controls"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar: Title & Watch Party Indicator */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="text-xs font-semibold text-zinc-400 shrink-0">در حال تماشا:</span>
              <h4 className="text-sm font-bold text-zinc-100 truncate">{videoTitle}</h4>
            </div>

            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-black/50 backdrop-blur-md rounded-full border border-zinc-800 text-[11px] font-medium text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>پخش زنده اختصاصی</span>
            </div>
          </div>

          {/* Bottom Controls Bar */}
          <div className="flex flex-col gap-2.5 mt-auto">
            {/* Seek / Progress Bar */}
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              bufferedTime={bufferedTime}
              onSeek={onSeek}
            />

            {/* Actions Bar */}
            <div className="flex items-center justify-between text-zinc-100">
              {/* Left Group (Play, Time, Volume) */}
              <div className="flex items-center gap-3 md:gap-4">
                {/* Play / Pause Toggle */}
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="p-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white transition-all cursor-pointer shadow-md shadow-rose-500/20 active:scale-95"
                  title={isPlaying ? 'توقف موقت (Space)' : 'پخش (Space)'}
                  id="btn-play-pause"
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 fill-white ml-0.5" />
                  )}
                </button>

                {/* Current / Duration Time */}
                <div className="text-xs font-mono text-zinc-300 select-none flex items-center" dir="ltr" id="player-time-display">
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

              {/* Right Group (PiP, Quality/Speed, Fullscreen) */}
              <div className="flex items-center gap-1.5 md:gap-2.5">
                {/* Picture in Picture */}
                {supportsPiP && onTogglePiP && (
                  <button
                    type="button"
                    onClick={onTogglePiP}
                    className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer select-none"
                    title="تصویر در تصویر (PiP)"
                    id="btn-toggle-pip"
                  >
                    <PictureInPicture2 className="h-4.5 w-4.5" />
                  </button>
                )}

                {/* Quality & Speed Settings Menu */}
                <QualityMenu
                  currentQuality={quality}
                  availableQualities={availableQualities}
                  playbackRate={playbackRate}
                  onQualityChange={onQualityChange}
                  onPlaybackRateChange={onPlaybackRateChange}
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
