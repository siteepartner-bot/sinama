import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const shortcuts = [
    { key: 'Space / K', desc: 'پخش یا توقف موقت ویدیو' },
    { key: 'F', desc: 'ورود یا خروج از حالت تمام صفحه' },
    { key: 'M', desc: 'قطع / وصل صدا (Mute)' },
    { key: 'J / L', desc: '۱۰ ثانیه پرش به عقب / جلو' },
    { key: '← / →', desc: '۵ ثانیه پرش به عقب / جلو' },
    { key: '↑ / ↓', desc: 'افزایش / کاهش ۵ درصدی صدا' },
    { key: 'C', desc: 'روشن / خاموش کردن زیرنویس (CC)' },
    { key: 'S', desc: 'همگام‌سازی سریع با زمان اتاق (Resync)' },
    { key: '< / >', desc: 'پرش فریم‌به‌فریم (در حالت توقف)' },
    { key: '0 تا 9', desc: 'پرش به درصدهای ۰٪ تا ۹۰٪ طول ویدیو' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          id="keyboard-shortcuts-overlay"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md bg-[#13151f] border border-zinc-700/80 rounded-2xl p-5 shadow-2xl text-zinc-100 text-right"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            id="keyboard-shortcuts-dialog"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400">
                  <Keyboard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">کلیدهای میانبر پلیر اختصاصی</h3>
                  <p className="text-[11px] text-zinc-400">کنترل سریع پخش ویدیو با صفحه کلید</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* List */}
            <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {shortcuts.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-black/30 border border-zinc-800/60 text-xs"
                >
                  <span className="text-zinc-300 font-medium">{item.desc}</span>
                  <kbd className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg font-mono text-[11px] text-rose-300 font-bold shadow-sm dir-ltr">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>

            {/* Footer Tip */}
            <div className="mt-4 pt-3 border-t border-zinc-800 text-center">
              <span className="text-[11px] text-zinc-400">
                همچنین با دوبار کلیک روی صفحه می‌توانید بین تمام‌صفحه و عادی جابجا شوید.
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
