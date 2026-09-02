import { useRef, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Tv, Sparkles, Youtube, Globe, Laptop, Play } from 'lucide-react';
import { MediaState } from '../../types';
import { YouTubePlayer } from './YouTubePlayer';
import { AparatPlayer } from './AparatPlayer';
import { DirectVideoPlayer } from './DirectVideoPlayer';
import { LocalVideoPlayer } from './LocalVideoPlayer';
import { parseYouTubeUrl, parseAparatUrl } from '../../utils/mediaParsers';

interface VideoPlayerCoreProps {
  mediaState?: MediaState | null;
  onSelectSampleSource?: (type: 'youtube' | 'aparat' | 'direct') => void;
}

export function VideoPlayerCore({
  mediaState,
  onSelectSampleSource,
}: VideoPlayerCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Monitor fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const hasValidSource = mediaState && mediaState.sourceType && mediaState.sourceUrl;

  // Empty / No Source State
  if (!hasValidSource) {
    return (
      <div
        ref={containerRef}
        className="relative flex flex-col items-center justify-center w-full aspect-video rounded-2xl bg-[#090a0f] border border-zinc-800/80 overflow-hidden shadow-2xl p-6 text-center"
        id="video-player-empty-state"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-3xl mb-4 text-zinc-500 shadow-xl"
        >
          <Tv className="h-10 w-10 text-rose-500/90" />
        </motion.div>

        <h3 className="text-base font-bold text-zinc-200">هنوز ویدیویی انتخاب نشده است</h3>
        <p className="text-xs text-zinc-400 mt-2 max-w-md leading-relaxed">
          از پنل پایین، یکی از منابع (یوتیوب، آپارات، لینک مستقیم یا فایل کامپیوتر) را برای تماشا انتخاب کنید.
        </p>

        {onSelectSampleSource && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] text-zinc-500 ml-1">شروع سریع با نمونه‌ها:</span>
            <button
              type="button"
              onClick={() => onSelectSampleSource('direct')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs rounded-xl font-medium transition-all cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>ویدیوی مستقیم ۴K</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectSampleSource('aparat')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 text-xs rounded-xl font-medium transition-all cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>ویدیوی آپارات</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectSampleSource('youtube')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs rounded-xl font-medium transition-all cursor-pointer"
            >
              <Youtube className="h-3.5 w-3.5" />
              <span>یوتیوب</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center w-full aspect-video rounded-2xl bg-black border border-zinc-800/80 overflow-hidden shadow-2xl"
      id="video-player-container-wrapper"
    >
      {/* 1. YouTube Player */}
      {mediaState.sourceType === 'youtube' && (
        <YouTubePlayer
          key={`yt_${mediaState.videoId || mediaState.sourceUrl}`}
          videoId={mediaState.videoId || parseYouTubeUrl(mediaState.sourceUrl).videoId || ''}
          isPlaying={mediaState.isPlaying}
          isMuted={false}
          volume={0.9}
          currentTime={mediaState.currentTime || 0}
        />
      )}

      {/* 2. Aparat Player */}
      {mediaState.sourceType === 'aparat' && (
        <AparatPlayer
          key={`aparat_${mediaState.videoId || mediaState.sourceUrl}`}
          videoHash={mediaState.videoId || parseAparatUrl(mediaState.sourceUrl).videoHash || ''}
          isPlaying={mediaState.isPlaying}
        />
      )}

      {/* 3. Direct Video URL Player */}
      {mediaState.sourceType === 'direct' && (
        <DirectVideoPlayer
          key={`direct_${mediaState.sourceUrl}`}
          src={mediaState.sourceUrl}
          title={mediaState.title || 'ویدیوی مستقیم'}
          initialPlayState={mediaState.isPlaying}
        />
      )}

      {/* 4. Local Video File Player */}
      {mediaState.sourceType === 'local' && (
        <LocalVideoPlayer
          key={`local_${mediaState.sourceUrl}`}
          fileOrBlobUrl={mediaState.sourceUrl}
          fileName={mediaState.fileName || mediaState.title || 'فایل ویدیوی سیستم'}
        />
      )}
    </div>
  );
}
