import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Film, Copy, Share2, LogOut, Check, Crown, Wifi, WifiOff, RefreshCw, Lock, Unlock, Users } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

export function RoomHeader() {
  const {
    roomState,
    currentUser,
    isHost,
    connectionStatus,
    leaveRoom,
    allowAnyoneControl,
    toggleRoomControlPermission
  } = useRoom();
  const [copied, setCopied] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (!roomState) return null;

  const roomLink = `${window.location.origin}/room/${roomState.roomId}`;

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setCopyFeedback('لینک اتاق کپی شد.');
      setTimeout(() => {
        setCopied(false);
        setCopyFeedback(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to copy', err);
      setCopyFeedback('خطا در کپی لینک');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const handleCopyLink = () => {
    copyToClipboard(roomLink);
  };

  const handleShareRoom = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `ورود به واچ پارتی: ${roomState.roomName}`,
          text: `به اتاق «${roomState.roomName}» در Roomy ملحق شو و با هم ویدیو تماشا کنیم!`,
          url: roomLink,
        });
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <header className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 md:px-6 bg-[#12141c] border-b border-zinc-800 text-[#f5f5f7] z-10" id="room-header">
      {/* Brand & Room Info */}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="flex items-center justify-center p-2.5 bg-rose-500 rounded-xl text-white shadow-lg shadow-rose-500/20">
          <Film className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-zinc-100">{roomState.roomName}</h1>
            <span className="text-xs px-2.5 py-0.5 bg-zinc-900 text-zinc-300 rounded-md border border-zinc-700/80 font-mono font-medium">
              کد: {roomState.roomId}
            </span>
            {isHost && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md font-semibold">
                <Crown className="h-3 w-3 text-amber-400" />
                <span>میزبان</span>
              </span>
            )}
            {/* Real-time Connection Status Badge */}
            {connectionStatus === 'connected' && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>سینک زنده (متصل)</span>
              </span>
            )}
            {connectionStatus === 'reconnecting' && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md font-medium">
                <RefreshCw className="h-3 w-3 text-amber-400 animate-spin" />
                <span>در حال اتصال مجدد...</span>
              </span>
            )}
            {connectionStatus === 'disconnected' && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-md font-medium">
                <WifiOff className="h-3 w-3 text-rose-400" />
                <span>قطع ارتباط</span>
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            کاربر فعال: <span className="text-zinc-200 font-medium">{currentUser?.name}</span>
          </p>
        </div>
      </div>

      {/* Control Actions & Permission Switch */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
        {/* Equal Video Control Permission Badge (ALL_ROOM_MEMBERS_CAN_CONTROL_MEDIA) */}
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm select-none"
          id="badge-video-permission-status"
          title="تمام اعضای اتاق (میزبان و اعضا) دسترسی کامل و برابر برای کنترل ویدیو دارند"
        >
          <Users className="h-3.5 w-3.5 text-emerald-400" />
          <span>کنترل ویدیو:</span>
          <span className="font-bold">آزاد برای همه</span>
        </div>

        {/* Copy Link Button */}
        <div className="relative">
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700/70 rounded-xl text-sm font-medium transition-colors cursor-pointer"
            id="btn-copy-link"
            title="کپی لینک مستقیم اتاق"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-zinc-400" />}
            <span>{copied ? 'کپی شد!' : 'کپی لینک اتاق'}</span>
          </button>
          
          <AnimatePresence>
            {copyFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 text-center text-xs bg-emerald-500 text-zinc-950 font-bold rounded-lg py-1.5 px-3 whitespace-nowrap shadow-xl"
              >
                {copyFeedback}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Share Button */}
        <button
          onClick={handleShareRoom}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700/70 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          id="btn-share-room"
          title="اشتراک‌گذاری اتاق"
        >
          <Share2 className="h-4 w-4 text-zinc-400" />
          <span>اشتراک‌گذاری</span>
        </button>

        {/* Leave Button */}
        <button
          onClick={leaveRoom}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          id="btn-leave-room"
          title="خروج از اتاق"
        >
          <LogOut className="h-4 w-4" />
          <span>خروج</span>
        </button>
      </div>
    </header>
  );
}
