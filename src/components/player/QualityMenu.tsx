import { useState, useRef, useEffect } from 'react';
import { Settings, Check, Gauge } from 'lucide-react';

interface QualityMenuProps {
  currentQuality: string;
  availableQualities?: string[];
  playbackRate?: number;
  onQualityChange?: (quality: string) => void;
  onPlaybackRateChange?: (rate: number) => void;
}

export function QualityMenu({
  currentQuality,
  availableQualities = [],
  playbackRate = 1,
  onQualityChange,
  onPlaybackRateChange,
}: QualityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<'main' | 'quality' | 'speed'>('main');
  const menuRef = useRef<HTMLDivElement>(null);

  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveSubMenu('main');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const hasQualityOptions = availableQualities && availableQualities.length > 0;

  return (
    <div ref={menuRef} className="relative select-none" id="player-settings-menu">
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setActiveSubMenu('main');
        }}
        className={`p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer flex items-center gap-1 ${
          isOpen ? 'bg-zinc-800 text-white' : ''
        }`}
        title="تنظیمات پخش"
        id="btn-player-settings"
      >
        <Settings className="h-4.5 w-4.5" />
      </button>

      {isOpen && (
        <div className="absolute bottom-11 left-0 bg-[#14161f] border border-zinc-800/90 rounded-2xl py-2 w-48 shadow-2xl text-xs z-50 text-right overflow-hidden backdrop-blur-xl">
          {activeSubMenu === 'main' && (
            <div className="space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 border-b border-zinc-800/80 mb-1">
                تنظیمات پخش
              </div>

              {/* Quality sub-item if supported */}
              {hasQualityOptions && (
                <button
                  type="button"
                  onClick={() => setActiveSubMenu('quality')}
                  className="w-full px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/60 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="text-zinc-500 font-mono text-[11px]">{currentQuality}</span>
                  <span className="font-medium">کیفیت ویدیو</span>
                </button>
              )}

              {/* Speed sub-item */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('speed')}
                className="w-full px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/60 flex items-center justify-between transition-colors cursor-pointer"
              >
                <span className="text-zinc-500 font-mono text-[11px]">{playbackRate}x</span>
                <span className="font-medium flex items-center gap-1.5">
                  <Gauge className="h-3.5 w-3.5 text-zinc-400" />
                  <span>سرعت پخش</span>
                </span>
              </button>
            </div>
          )}

          {activeSubMenu === 'quality' && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveSubMenu('main')}
                className="w-full px-3 py-1.5 text-[10px] font-bold text-rose-400 border-b border-zinc-800/80 mb-1 text-right flex items-center justify-between hover:bg-zinc-800/40 cursor-pointer"
              >
                <span>بازگشت</span>
                <span>← کیفیت ویدیو</span>
              </button>

              {availableQualities.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    onQualityChange?.(q);
                    setIsOpen(false);
                    setActiveSubMenu('main');
                  }}
                  className={`w-full px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer ${
                    currentQuality === q
                      ? 'text-rose-400 font-bold bg-rose-500/10'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                  }`}
                >
                  {currentQuality === q && <Check className="h-3.5 w-3.5 text-rose-400" />}
                  <span className="font-mono">{q === 'Auto' ? 'خودکار' : q}</span>
                </button>
              ))}
            </div>
          )}

          {activeSubMenu === 'speed' && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveSubMenu('main')}
                className="w-full px-3 py-1.5 text-[10px] font-bold text-rose-400 border-b border-zinc-800/80 mb-1 text-right flex items-center justify-between hover:bg-zinc-800/40 cursor-pointer"
              >
                <span>بازگشت</span>
                <span>← سرعت پخش</span>
              </button>

              {speedOptions.map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => {
                    onPlaybackRateChange?.(rate);
                    setIsOpen(false);
                    setActiveSubMenu('main');
                  }}
                  className={`w-full px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer ${
                    playbackRate === rate
                      ? 'text-rose-400 font-bold bg-rose-500/10'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                  }`}
                >
                  {playbackRate === rate && <Check className="h-3.5 w-3.5 text-rose-400" />}
                  <span className="font-mono">{rate === 1 ? 'عادی (1x)' : `${rate}x`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
