import { useState, useRef, useEffect } from 'react';
import { Settings, Check, Gauge, Maximize2 } from 'lucide-react';

export type AspectRatioType = '16:9' | '21:9' | '4:3' | 'cover' | 'contain';

interface QualityMenuProps {
  currentQuality?: string;
  availableQualities?: string[];
  playbackRate?: number;
  aspectRatio?: AspectRatioType;
  onQualityChange?: (quality: string) => void;
  onPlaybackRateChange?: (rate: number) => void;
  onAspectRatioChange?: (ratio: AspectRatioType) => void;
}

export function QualityMenu({
  currentQuality = '1080p',
  availableQualities = [],
  playbackRate = 1,
  aspectRatio = 'contain',
  onQualityChange,
  onPlaybackRateChange,
  onAspectRatioChange,
}: QualityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<'main' | 'quality' | 'speed' | 'aspect'>('main');
  const menuRef = useRef<HTMLDivElement>(null);

  const speedOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  const aspectOptions: { id: AspectRatioType; label: string }[] = [
    { id: 'contain', label: 'تناسب کامل (Fit)' },
    { id: 'cover', label: 'پر کردن بدون کادر (Fill)' },
    { id: '16:9', label: 'استاندارد (16:9)' },
    { id: '21:9', label: 'سینمایی عریض (21:9)' },
    { id: '4:3', label: 'کلاسیک (4:3)' },
  ];

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
        title="تنظیمات پخش و تصویر"
        id="btn-player-settings"
      >
        <Settings className="h-4.5 w-4.5" />
      </button>

      {isOpen && (
        <div className="absolute bottom-11 left-0 bg-[#14161f] border border-zinc-800/90 rounded-2xl py-2 w-52 shadow-2xl text-xs z-50 text-right overflow-hidden backdrop-blur-xl">
          {activeSubMenu === 'main' && (
            <div className="space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 border-b border-zinc-800/80 mb-1">
                تنظیمات پیشرفته پخش
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

              {/* Aspect Ratio sub-item */}
              <button
                type="button"
                onClick={() => setActiveSubMenu('aspect')}
                className="w-full px-3 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/60 flex items-center justify-between transition-colors cursor-pointer"
              >
                <span className="text-zinc-500 font-mono text-[10px]">
                  {aspectOptions.find((a) => a.id === aspectRatio)?.label.split(' ')[0]}
                </span>
                <span className="font-medium flex items-center gap-1.5">
                  <Maximize2 className="h-3.5 w-3.5 text-zinc-400" />
                  <span>ابعاد و کادر تصویر</span>
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

          {activeSubMenu === 'aspect' && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveSubMenu('main')}
                className="w-full px-3 py-1.5 text-[10px] font-bold text-rose-400 border-b border-zinc-800/80 mb-1 text-right flex items-center justify-between hover:bg-zinc-800/40 cursor-pointer"
              >
                <span>بازگشت</span>
                <span>← نسبت تصویر</span>
              </button>

              {aspectOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onAspectRatioChange?.(opt.id);
                    setIsOpen(false);
                    setActiveSubMenu('main');
                  }}
                  className={`w-full px-3 py-1.5 flex items-center justify-between transition-colors cursor-pointer ${
                    aspectRatio === opt.id
                      ? 'text-rose-400 font-bold bg-rose-500/10'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                  }`}
                >
                  {aspectRatio === opt.id && <Check className="h-3.5 w-3.5 text-rose-400" />}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
