import React from 'react';
import { Volume2, Volume1, VolumeX, Zap } from 'lucide-react';

interface VolumeControlProps {
  volume: number; // 0 to 2 (1 = 100%, 2 = 200% boost)
  isMuted: boolean;
  onVolumeChange: (newVol: number) => void;
  onToggleMute: () => void;
}

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}: VolumeControlProps) {
  const effectiveVolume = isMuted ? 0 : volume;
  const isBoosted = effectiveVolume > 1.0;

  const renderVolumeIcon = () => {
    if (isMuted || effectiveVolume === 0) {
      return <VolumeX className="h-4.5 w-4.5 text-rose-400" />;
    }
    if (isBoosted) {
      return <Zap className="h-4.5 w-4.5 text-amber-400 fill-amber-400/30" />;
    }
    if (effectiveVolume < 0.5) {
      return <Volume1 className="h-4.5 w-4.5 text-zinc-300" />;
    }
    return <Volume2 className="h-4.5 w-4.5 text-zinc-200" />;
  };

  const percentage = Math.round(effectiveVolume * 100);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 group/volume relative select-none" id="volume-control-wrapper">
      <button
        type="button"
        onClick={onToggleMute}
        className={`p-1.5 rounded-lg hover:bg-zinc-800/80 transition-colors cursor-pointer ${
          isBoosted ? 'text-amber-400' : 'text-zinc-300 hover:text-white'
        }`}
        title={isMuted ? 'فعال‌سازی صدا' : isBoosted ? `صدای تقویت‌شده: ${percentage}%` : 'قطع صدا'}
        id="btn-volume-mute"
      >
        {renderVolumeIcon()}
      </button>

      <div className="w-16 sm:w-20 md:w-24 flex items-center gap-1.5">
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={effectiveVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none transition-all ${
            isBoosted
              ? 'bg-amber-950/60 accent-amber-400'
              : 'bg-zinc-700/80 accent-rose-500'
          }`}
          title={`میزان صدا: ${percentage}% ${isBoosted ? '(تقویت‌شده)' : ''}`}
          id="slider-volume"
        />
        <span
          className={`text-[10px] font-mono font-semibold min-w-[28px] text-left ${
            isBoosted ? 'text-amber-400 font-bold' : 'text-zinc-400'
          }`}
          dir="ltr"
        >
          {percentage}%
        </span>
      </div>
    </div>
  );
}
