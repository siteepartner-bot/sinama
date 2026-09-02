import { motion } from 'motion/react';
import { AlertTriangle, RefreshCw, Film } from 'lucide-react';

interface VideoErrorProps {
  message?: string;
  onRetry?: () => void;
  onSelectOtherSource?: () => void;
}

export function VideoError({
  message = 'مرورگر قادر به پخش این ویدیو نیست یا آدرس منبع در دسترس نمی‌باشد.',
  onRetry,
  onSelectOtherSource,
}: VideoErrorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#0c0d14]/95 backdrop-blur-md text-center z-30"
      id="video-error-overlay"
    >
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <h3 className="text-base font-bold text-zinc-100 mb-2">خطا در بارگذاری ویدیو</h3>
      <p className="text-xs text-zinc-400 max-w-md leading-relaxed mb-6">
        {message}
      </p>

      <div className="flex items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-500/15"
            id="btn-video-retry"
          >
            <RefreshCw className="h-4 w-4" />
            <span>تلاش مجدد</span>
          </button>
        )}

        {onSelectOtherSource && (
          <button
            type="button"
            onClick={onSelectOtherSource}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-xl border border-zinc-700 transition-all cursor-pointer"
            id="btn-select-other-source"
          >
            <Film className="h-4 w-4" />
            <span>انتخاب منبع دیگر</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}
