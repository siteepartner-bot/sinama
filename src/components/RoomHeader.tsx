import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Film, Copy, Share2, LogOut, Check } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

export function RoomHeader() {
  const { roomState, leaveRoom } = useRoom();
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  if (!roomState) return null;

  const roomLink = `${window.location.origin}/room/${roomState.roomId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleShareRoom = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `ورود به واچ پارتی در ${roomState.roomName}`,
          text: `بیا با هم فیلم تماشا کنیم و گپ بزنیم!`,
          url: roomLink,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      } catch (err) {
        console.log('Share canceled or failed', err);
        handleCopyLink();
      }
    } else {
      // Fallback to copying
      handleCopyLink();
    }
  };

  return (
    <header className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 md:px-6 bg-[#12141c] border-b border-zinc-800 text-[#f5f5f7] z-10" id="room-header">
      {/* Brand & Room Info */}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="flex items-center justify-center p-2 bg-rose-500 rounded-xl text-white">
          <Film className="h-5 w-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-zinc-100">{roomState.roomName}</h1>
            <span className="text-xs px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded-md border border-rose-500/20 font-medium">
              کد: {roomState.roomId}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">پلتفرم تماشای گروهی فیلم Roomy</p>
        </div>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
        {/* Copy Link Button */}
        <button
          onClick={handleCopyLink}
          className="relative inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          id="btn-copy-link"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400 animate-scale" /> : <Copy className="h-4 w-4" />}
          <span>{copied ? 'کپی شد!' : 'کپی لینک دعوت'}</span>
          
          <AnimatePresence>
            {copied && (
              <motion.span
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute -bottom-10 right-0 left-0 text-center text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-md py-1 px-2 whitespace-nowrap"
              >
                کپی شد! به دوستان بفرستید
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Share Button */}
        <button
          onClick={handleShareRoom}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          id="btn-share-room"
        >
          <Share2 className="h-4 w-4" />
          <span>اشتراک‌گذاری</span>
        </button>

        {/* Leave Button */}
        <button
          onClick={leaveRoom}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/10 rounded-xl text-sm font-medium transition-colors cursor-pointer"
          id="btn-leave-room"
        >
          <LogOut className="h-4 w-4" />
          <span>خروج</span>
        </button>
      </div>
    </header>
  );
}
