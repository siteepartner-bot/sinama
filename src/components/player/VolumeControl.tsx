import { Volume2, Volume1, VolumeX } from 'lucide-react';

interface VolumeControlProps {
  volume: number; // 0 to 1
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

  const renderVolumeIcon = () => {
    if (isMuted || effectiveVolume === 0) {
      return <VolumeX className="h-5 w-5 text-rose-400" />;
    }
    if (effectiveVolume < 0.5) {
      return <Volume1 className="h-5 w-5 text-zinc-300" />;
    }
    return <Volume2 className="h-5 w-5 text-zinc-200" />;
  };

  return (
    <div className="flex items-center gap-2 group/volume relative select-none" id="volume-control-wrapper">
      <button
        type="button"
        onClick={onToggleMute}
        className="p-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-300 hover:text-white transition-colors cursor-pointer"
        title={isMuted ? 'فعال‌سازی صدا' : 'قطع صدا'}
        id="btn-volume-mute"
      >
        {renderVolumeIcon()}
      </button>

      <div className="w-16 md:w-20 flex items-center">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={effectiveVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-zinc-700/80 rounded-lg appearance-none cursor-pointer accent-rose-500 focus:outline-none"
          title={`میزان صدا: ${Math.round(effectiveVolume * 100)}%`}
          id="slider-volume"
        />
      </div>
    </div>
  );
}
