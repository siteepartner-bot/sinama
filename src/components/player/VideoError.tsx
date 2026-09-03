import { motion } from 'motion/react';
import { AlertTriangle, RefreshCw, Film, Trash2, Monitor } from 'lucide-react';

interface VideoErrorProps {
  message?: string;
  onRetry?: () => void;
  onSelectOtherSource?: () => void;
  onClearSource?: () => void;
}

export function VideoError({
  message = 'مرورگر قادر به پخش این ویدیو نیست یا آدرس منبع در دسترس نمی‌باشد.',
  onRetry,
  onSelectOtherSource,
  onClearSource,
}: VideoErrorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[#0c0d14]/95 backdrop-blur-md text-center z-30 overflow-y-auto"
      id="video-error-overlay"
    >
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl mb-4 shadow-lg shadow-rose-500/10">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <h3 className="text-base font-bold text-zinc-100 mb-2">خطا در بارگذاری ویدیو</h3>
      <p className="text-xs text-zinc-300 max-w-lg leading-relaxed mb-3">
        {message}
      </p>

      {/* Helpful Hint Card */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 max-w-md text-right text-[11px] text-zinc-400 mb-6 leading-normal space-y-1">
        <div className="font-semibold text-zinc-300 flex items-center gap-1">
          <span>💡 علل احتمالی و راهکارهای حل مشکل:</span>
        </div>
        <div>• <strong>محدودیت CORS یا فیلترینگ:</strong> سرور ارائه‌دهنده ویدیو اجازه پخش در وب‌سایت‌ها را نمی‌دهد یا لینک مسدود است.</div>
        <div>• <strong>کدک ناسازگار:</strong> ویدیو از کدک‌های x265/AC3 استفاده می‌کند که مرورگرها مستقیماً پخش نمی‌کنند.</div>
        <div>• <strong>راهکار پیشنهادی:</strong> می‌توانید از <strong>یوتیوب</strong>، <strong>آپارات</strong>، <strong>فایل MP4 محلی</strong> یا قابلیت <strong>اشتراک تصویر زنده (Screen Share)</strong> استفاده کنید.</div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
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
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-xl border border-zinc-700 transition-all cursor-pointer"
            id="btn-select-other-source"
          >
            <Film className="h-4 w-4 text-amber-400" />
            <span>انتخاب منبع دیگر</span>
          </button>
        )}

        {onClearSource && (
          <button
            type="button"
            onClick={onClearSource}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 text-xs font-medium rounded-xl border border-zinc-800 hover:border-rose-900/50 transition-all cursor-pointer"
            id="btn-clear-broken-source"
          >
            <Trash2 className="h-4 w-4" />
            <span>حذف و بستن ویدیو</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}

