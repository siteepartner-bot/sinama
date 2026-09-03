import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Subtitles, Upload, Trash2, Sliders, Check } from 'lucide-react';
import { SubtitleCue, parseSubtitleContent } from '../../utils/subtitleParser';

interface SubtitleMenuProps {
  isOpen: boolean;
  onClose: () => void;
  isEnabled: boolean;
  onToggleEnabled: () => void;
  currentCues: SubtitleCue[];
  onSetCues: (cues: SubtitleCue[], title?: string) => void;
  subtitleTitle?: string;
  offsetSeconds: number;
  onOffsetChange: (offset: number) => void;
  fontSize: 'small' | 'medium' | 'large';
  onFontSizeChange: (size: 'small' | 'medium' | 'large') => void;
}

export function SubtitleMenu({
  isOpen,
  onClose,
  isEnabled,
  onToggleEnabled,
  currentCues,
  onSetCues,
  subtitleTitle = 'زیرنویس سفارشی',
  offsetSeconds,
  onOffsetChange,
  fontSize,
  onFontSizeChange,
}: SubtitleMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const cues = parseSubtitleContent(text);
        if (cues.length > 0) {
          onSetCues(cues, file.name);
          if (!isEnabled) {
            onToggleEnabled();
          }
        }
      }
    };
    reader.readAsText(file);
  };

  const handleLoadSampleSubtitle = () => {
    // A helpful sample subtitle in Persian & English
    const sampleSrt = `1
00:00:01,000 --> 00:00:05,000
به اتاق تماشای همزمان واچ‌پارتی خوش آمدید!
Welcome to the Watch Party room!

2
00:00:05,500 --> 00:00:10,000
این ویدیو با دقت فریم‌به‌فریم بین همه اعضا همگام است.
This video is frame-synchronized across all members.

3
00:00:11,000 --> 00:00:16,000
می‌توانید زیرنویس دلخواه SRT یا VTT خود را هم آپلود کنید.
You can upload your own custom SRT or VTT subtitle file.

4
00:00:17,000 --> 00:00:23,000
امکان تنظیم تاخیر زمانی زیرنویس و اندازه قلم در این پنل فعال است.
Adjust subtitle timing offset and font sizes right in this panel.

5
00:00:24,000 --> 00:00:30,000
از تماشای فیلم با دوستانتان لذت ببرید!
Enjoy watching movies with your friends!
`;
    const cues = parseSubtitleContent(sampleSrt);
    onSetCues(cues, 'زیرنویس نمونه فارسی و انگلیسی');
    if (!isEnabled) {
      onToggleEnabled();
    }
  };

  const handleClearSubtitles = () => {
    onSetCues([]);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for outside clicks */}
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-14 left-4 sm:left-12 z-40 w-72 sm:w-80 bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/80 rounded-2xl p-4 shadow-2xl text-zinc-100 select-none text-right"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            id="subtitle-settings-popover"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Subtitles className="h-4 w-4 text-rose-500" />
                <span className="text-xs font-bold">تنظیمات زیرنویس (CC)</span>
              </div>

              {/* Master Toggle */}
              <button
                type="button"
                onClick={onToggleEnabled}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isEnabled
                    ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/20'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isEnabled ? 'روشن' : 'خاموش'}
              </button>
            </div>

            {/* Current Subtitle Status */}
            <div className="mt-3 mb-3 p-2.5 bg-black/40 border border-zinc-800 rounded-xl flex items-center justify-between">
              <div className="min-w-0 pr-1">
                <div className="text-[11px] text-zinc-400">فایل فعال:</div>
                <div className="text-xs font-semibold text-zinc-200 truncate" title={subtitleTitle}>
                  {currentCues.length > 0 ? subtitleTitle : 'هیچ زیرنویسی بارگذاری نشده'}
                </div>
              </div>
              {currentCues.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSubtitles}
                  className="p-1.5 text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-zinc-800/80 transition-colors"
                  title="حذف زیرنویس"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Action Buttons: Upload & Load Sample */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 py-2 px-2 bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 text-xs font-medium rounded-xl border border-zinc-700/60 transition-all cursor-pointer active:scale-95"
              >
                <Upload className="h-3.5 w-3.5 text-rose-400" />
                <span>بارگذاری SRT / VTT</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.vtt,text/vtt,text/plain"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                type="button"
                onClick={handleLoadSampleSubtitle}
                className="flex items-center justify-center gap-1.5 py-2 px-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium rounded-xl border border-rose-500/25 transition-all cursor-pointer active:scale-95"
              >
                <span>تست با زیرنویس نمونه</span>
              </button>
            </div>

            {/* Subtitle Font Size */}
            <div className="mb-3 pt-2 border-t border-zinc-800">
              <label className="text-[11px] text-zinc-400 mb-1.5 block">اندازه متن زیرنویس:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['small', 'medium', 'large'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onFontSizeChange(sz)}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      fontSize === sz
                        ? 'bg-zinc-700 text-white border border-zinc-600 font-bold'
                        : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sz === 'small' ? 'کوچک' : sz === 'medium' ? 'معمولی' : 'بزرگ'}
                  </button>
                ))}
              </div>
            </div>

            {/* Subtitle Timing Offset / Sync Adjuster */}
            <div className="pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Sliders className="h-3 w-3" />
                  <span>تنظیم هماهنگی زمانی:</span>
                </span>
                <span className="font-mono text-zinc-200 dir-ltr font-semibold">
                  {offsetSeconds > 0 ? `+${offsetSeconds.toFixed(1)}s` : `${offsetSeconds.toFixed(1)}s`}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onOffsetChange(Number((offsetSeconds - 0.5).toFixed(1)))}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] font-mono cursor-pointer"
                  title="نیم ثانیه دیرتر نمایش داده شود"
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={() => onOffsetChange(0)}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg text-[11px] cursor-pointer"
                >
                  صفر
                </button>
                <button
                  type="button"
                  onClick={() => onOffsetChange(Number((offsetSeconds + 0.5).toFixed(1)))}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] font-mono cursor-pointer"
                  title="نیم ثانیه زودتر نمایش داده شود"
                >
                  +0.5s
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
