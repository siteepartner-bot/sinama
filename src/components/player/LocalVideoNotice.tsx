import React from 'react';
import { motion } from 'motion/react';
import { Laptop, HardDrive, Sparkles, FolderOpen, ArrowRight } from 'lucide-react';

export interface LocalVideoNoticeProps {
  ownerName?: string;
  fileName?: string;
  isCurrentUserOwner?: boolean;
  onSelectOwnSource?: () => void;
}

export function LocalVideoNotice({
  ownerName = 'یکی از اعضا',
  fileName = 'فایل ویدیوی سیستم',
  isCurrentUserOwner = false,
  onSelectOwnSource
}: LocalVideoNoticeProps) {
  return (
    <div
      className="relative flex flex-col items-center justify-center w-full h-full p-6 sm:p-8 bg-gradient-to-b from-[#0e1017] to-[#08090d] text-center select-none"
      id="local-file-notice-container"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,63,94,0.06)_0,transparent_70%)] pointer-events-none" />

      {/* Floating Icon Graphic */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative mb-5"
      >
        <div className="w-16 h-16 rounded-2xl bg-zinc-900/90 border border-zinc-700/80 flex items-center justify-center shadow-2xl text-rose-400">
          <Laptop className="h-8 w-8 text-rose-500" />
        </div>
        <div className="absolute -bottom-1 -right-1 p-1 bg-zinc-950 border border-zinc-700 rounded-lg text-amber-400">
          <HardDrive className="h-4 w-4" />
        </div>
      </motion.div>

      {/* File Badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono mb-3">
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="truncate max-w-[240px] dir-ltr">{fileName}</span>
      </div>

      {/* Headline */}
      <h3 className="text-base sm:text-lg font-bold text-zinc-100 mb-2">
        پخش از حافظه کامپیوتر {ownerName}
      </h3>

      {/* Explanation banner per Phase 4 requirements */}
      <p className="text-xs sm:text-sm text-zinc-400 max-w-md leading-relaxed mb-6">
        این ویدیو مستقیماً از روی کامپیوتر کاربر <strong className="text-zinc-200 font-semibold">{ownerName}</strong> در حال پخش است.
        قابلیت استریم زنده فایل‌های محلی شخصی (P2P Streaming) در فاز بعدی اضافه خواهد شد.
      </p>

      {/* Action / Fallback Options */}
      {onSelectOwnSource && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onSelectOwnSource}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-xl border border-zinc-700 transition-all cursor-pointer"
          >
            <span>انتخاب منبع دیگر (یوتیوب / آپارات / لینک مستقیم)</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
