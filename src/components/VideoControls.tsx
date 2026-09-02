import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Minimize2, Settings, ShieldAlert } from 'lucide-react';

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  quality: string;
  videoTitle: string;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onQualityChange: (quality: string) => void;
  isFullscreen: boolean;
}

export function VideoControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  quality,
  videoTitle,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onQualityChange,
  isFullscreen,
}: VideoControlsProps) {
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const formatTime = (secs: number) => {
    const min = Math.floor(secs / 60).toString().padStart(2, '0');
    const sec = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const targetTime = percentage * duration;
    onSeek(targetTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/85 via-black/10 to-black/50 p-4 select-none z-20"
      id="video-controls-overlay"
    >
      {/* Top Bar: Title & Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs font-bold text-zinc-300">در حال پخش:</span>
          <h4 className="text-sm font-bold text-zinc-100 truncate max-w-xs md:max-w-md">{videoTitle}</h4>
        </div>
        <div className="text-xs bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800 text-zinc-400">
          حالت همگام‌سازی فعال
        </div>
      </div>

      {/* Bottom controls panel */}
      <div className="flex flex-col gap-3">
        {/* Progress Bar Seeker */}
        <div 
          onClick={handleProgressClick}
          className="relative w-full h-1.5 bg-zinc-800 rounded-full cursor-pointer group/progress transition-all hover:h-2.5"
          id="playback-progress-track"
        >
          {/* Buffered / Elapsed bar */}
          <div
            style={{ width: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 right-0 bg-rose-500 rounded-full"
          />

          {/* Indicator Dot */}
          <div
            style={{ right: `calc(${progressPercent}% - 6px)` }}
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-rose-600 rounded-full scale-0 group-hover/progress:scale-100 transition-transform shadow-md"
          />
        </div>

        {/* Action Controls Row */}
        <div className="flex items-center justify-between text-zinc-100">
          <div className="flex items-center gap-4">
            {/* Play/Pause Trigger */}
            <button
              onClick={onTogglePlay}
              className="p-1.5 rounded-lg hover:bg-zinc-800/60 text-rose-500 hover:text-rose-400 transition-colors cursor-pointer"
              id="btn-play-pause-toggle"
            >
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-rose-500" />}
            </button>

            {/* Time display */}
            <div className="text-sm text-zinc-300 font-mono" id="time-display">
              <span>{formatTime(currentTime)}</span>
              <span className="mx-1 text-zinc-500">/</span>
              <span className="text-zinc-400">{formatTime(duration)}</span>
            </div>

            {/* Volume section */}
            <div className="hidden sm:flex items-center gap-2 group/volume relative">
              <button
                onClick={onToggleMute}
                className="p-1.5 rounded-lg hover:bg-zinc-800/60 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                id="btn-mute-toggle"
              >
                {isMuted ? <VolumeX className="h-5 w-5 text-zinc-500" /> : <Volume2 className="h-5 w-5" />}
              </button>
              
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-16 md:w-20 accent-rose-500 h-1 bg-zinc-800 rounded-lg cursor-pointer"
                id="volume-slider"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Resolution/Quality select */}
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-zinc-900/60 border border-zinc-800 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                id="btn-quality-menu"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>{quality}</span>
              </button>

              {showQualityMenu && (
                <div className="absolute bottom-10 left-0 bg-[#16181f] border border-zinc-800 rounded-xl py-1.5 w-24 shadow-2xl text-xs z-50 overflow-hidden">
                  {['1080p', '720p', '480p', 'Auto'].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        onQualityChange(q);
                        setShowQualityMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 transition-colors text-right flex justify-end ${quality === q ? 'text-rose-500 font-bold bg-rose-500/10' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'}`}
                    >
                      {q === 'Auto' ? 'خودکار' : q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen control */}
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-zinc-800/60 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              id="btn-fullscreen-toggle"
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
