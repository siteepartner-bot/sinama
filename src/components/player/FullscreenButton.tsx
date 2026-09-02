import { Maximize, Minimize } from 'lucide-react';

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function FullscreenButton({
  isFullscreen,
  onToggleFullscreen,
}: FullscreenButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggleFullscreen}
      className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer select-none"
      title={isFullscreen ? 'خروج از تمام‌صفحه (Esc)' : 'تمام‌صفحه (F)'}
      id="btn-toggle-fullscreen"
    >
      {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
    </button>
  );
}
