import { Play, Pause, RotateCcw, RotateCw, Square, Radio, Users } from 'lucide-react';
import { formatVideoTime } from '../../utils/mediaParsers';

interface SyncedPlaybackBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration?: number;
  sourceTitle?: string;
  sourceType?: string;
  lastUpdatedByName?: string;
  isHost?: boolean;
  usersCount?: number;
  onTogglePlay: () => void;
  onRewind: (seconds: number) => void;
  onForward: (seconds: number) => void;
  onStop: () => void;
}

export function SyncedPlaybackBar({
  isPlaying,
  currentTime,
  duration = 0,
  sourceTitle = 'ویدیو',
  sourceType,
  lastUpdatedByName,
  isHost,
  usersCount = 1,
  onTogglePlay,
  onRewind,
  onForward,
  onStop,
}: SyncedPlaybackBarProps) {
  if (!sourceType) return null;

  return (
    <div
      className="mt-3 w-full bg-zinc-900/90 backdrop-blur-md border border-zinc-800/90 rounded-2xl p-3 md:p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-3 text-zinc-100"
      id="synced-playback-toolbar"
    >
      {/* Left: Quick Sync Action Buttons */}
      <div className="flex items-center gap-2 md:gap-2.5 w-full md:w-auto justify-center md:justify-start">
        {/* Play / Pause Toggle */}
        <button
          type="button"
          onClick={onTogglePlay}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs md:text-sm transition-all cursor-pointer shadow-lg active:scale-95 ${
            isPlaying
              ? 'bg-amber-500 hover:bg-amber-600 text-zinc-950 shadow-amber-500/20'
              : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
          }`}
          title={isPlaying ? 'توقف موقت همزمان برای همه' : 'پخش همزمان برای همه'}
          id="synced-btn-toggle-play"
        >
          {isPlaying ? (
            <>
              <Pause className="h-4 w-4 fill-zinc-950" />
              <span>استپ (توقف موقت)</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-white ml-0.5" />
              <span>پخش همزمان</span>
            </>
          )}
        </button>

        {/* Rewind 10s */}
        <button
          type="button"
          onClick={() => onRewind(10)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/50 text-xs font-semibold transition-all cursor-pointer active:scale-95"
          title="عقب زدن ۱۰ ثانیه (سینک برای همه)"
          id="synced-btn-rewind"
        >
          <RotateCcw className="h-3.5 w-3.5 text-sky-400" />
          <span>۱۰- ثانیه</span>
        </button>

        {/* Forward 10s */}
        <button
          type="button"
          onClick={() => onForward(10)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700/50 text-xs font-semibold transition-all cursor-pointer active:scale-95"
          title="جلو زدن ۱۰ ثانیه (سینک برای همه)"
          id="synced-btn-forward"
        >
          <span>۱۰+ ثانیه</span>
          <RotateCw className="h-3.5 w-3.5 text-sky-400" />
        </button>

        {/* Stop / Reset */}
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 border border-zinc-700/40 text-xs font-medium transition-all cursor-pointer active:scale-95"
          title="توقف کامل و بازگشت به ابتدا"
          id="synced-btn-stop"
        >
          <Square className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">ریست</span>
        </button>
      </div>

      {/* Right: Live Sync Status Badge & Current Time */}
      <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto text-xs">
        {/* Time counter */}
        <div className="px-3 py-1.5 bg-black/50 rounded-xl border border-zinc-800/80 font-mono text-zinc-300 flex items-center gap-1" dir="ltr">
          <span className="text-zinc-100 font-bold">{formatVideoTime(currentTime)}</span>
          {duration > 0 && (
            <>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-400">{formatVideoTime(duration)}</span>
            </>
          )}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-[11px]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>سینک زنده دوطرفه</span>
          {lastUpdatedByName && (
            <span className="text-zinc-400 hidden sm:inline border-r border-zinc-700 pr-2 mr-1">
              آخرین تغییر: <strong className="text-zinc-200">{lastUpdatedByName}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
