import { motion } from 'motion/react';
import { Monitor } from 'lucide-react';

interface ScreenShareButtonProps {
  isSharing: boolean;
  onClick: () => void;
}

export function ScreenShareButton({ isSharing, onClick }: ScreenShareButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`p-3 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
        isSharing
          ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20'
          : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
      }`}
      title={isSharing ? 'قطع اشتراک صفحه' : 'اشتراک‌گذاری صفحه نمایش'}
      id="btn-screenshare-toggle"
    >
      <Monitor className="h-5 w-5" />
    </motion.button>
  );
}
