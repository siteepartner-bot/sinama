import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, Volume2, VolumeX, Maximize, Settings, Tv, AlertCircle } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { VideoControls } from './VideoControls';

export function VideoPlayer() {
  const { roomState, setVideoPlaying, seekVideo, setVideoQuality } = useRoom();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [duration, setDuration] = useState(360);
  const [currentTime, setCurrentTime] = useState(0);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);

  const currentVideo = roomState?.currentVideo;
  const isVideoSelected = currentVideo && currentVideo.sourceType !== null;

  // Revoke previous object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  // Sync state to HTML5 Video player if applicable
  useEffect(() => {
    if (!videoRef.current || !currentVideo) return;

    if (currentVideo.isPlaying) {
      videoRef.current.play().catch(() => {
        // Autoplay policy blocker fallback
        setVideoPlaying(false);
      });
    } else {
      videoRef.current.pause();
    }
  }, [currentVideo?.isPlaying, currentVideo?.sourceType, currentVideo?.url]);

  // Sync seek times
  useEffect(() => {
    if (!videoRef.current || !currentVideo) return;
    const diff = Math.abs(videoRef.current.currentTime - currentVideo.currentTime);
    if (diff > 1.5) {
      videoRef.current.currentTime = currentVideo.currentTime;
    }
  }, [currentVideo?.currentTime]);

  // Sync local file or direct url
  useEffect(() => {
    if (!currentVideo) return;

    if (currentVideo.sourceType === 'local') {
      // It might be a file or object URL. Check if url is a valid blob url or a mock string
      if (currentVideo.url.startsWith('blob:') || currentVideo.url.startsWith('http')) {
        setLocalVideoUrl(currentVideo.url);
      } else {
        // Fallback to stock video if it is a mock name
        setLocalVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
      }
    } else if (currentVideo.sourceType === 'direct') {
      setLocalVideoUrl(currentVideo.url || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    } else {
      setLocalVideoUrl(null);
    }
  }, [currentVideo?.sourceType, currentVideo?.url]);

  // Auto-hide controls overlay
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (currentVideo?.isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
    }
    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      clearTimeout(timeout);
    };
  }, [currentVideo?.isPlaying]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    // Periodically update global state time (without sending too many renders)
    if (Math.floor(videoRef.current.currentTime) % 3 === 0) {
      seekVideo(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 360);
  };

  const handleTogglePlay = () => {
    if (!currentVideo) return;
    setVideoPlaying(!currentVideo.isPlaying);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Fullscreen failed', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Monitor fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Format time (MM:SS)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-center w-full aspect-video rounded-2xl bg-[#090a0f] border border-zinc-800/80 overflow-hidden group shadow-2xl"
      id="theater-canvas-container"
    >
      {!isVideoSelected ? (
        /* Empty / No Video State */
        <div className="flex flex-col items-center text-center p-8 text-zinc-400">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="p-4 bg-zinc-900 border border-zinc-800 rounded-3xl mb-4 text-zinc-500 shadow-lg"
          >
            <Tv className="h-12 w-12 text-rose-500/80" />
          </motion.div>
          <h3 className="text-lg font-bold text-zinc-200">ویدیویی در حال پخش نیست</h3>
          <p className="text-sm text-zinc-500 mt-2 max-w-md">
            یکی از گزینه‌های منبع ویدیو را در بخش پایین انتخاب کرده و آدرس آن را وارد کنید تا واچ پارتی آغاز شود.
          </p>
        </div>
      ) : (
        /* Video Rendering */
        <div className="w-full h-full relative flex items-center justify-center">
          {currentVideo.sourceType === 'youtube' ? (
            /* YouTube Embed Mock/Real */
            <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center">
              {/* Overlay active visual indicators */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 z-10 pointer-events-none" />
              <iframe
                src={`https://www.youtube.com/embed/${getYouTubeID(currentVideo.url)}?autoplay=${currentVideo.isPlaying ? 1 : 0}&controls=0&mute=${isMuted ? 1 : 0}&start=${Math.floor(currentVideo.currentTime)}`}
                title="YouTube Video Player"
                className="w-full h-full border-0 pointer-events-auto"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          ) : currentVideo.sourceType === 'aparat' ? (
            /* Aparat Embed Mock/Real */
            <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 z-10 pointer-events-none" />
              <iframe
                src={`https://www.aparat.com/video/video/embed/videohash/${getAparatID(currentVideo.url)}/vt/frame?autoplay=${currentVideo.isPlaying}`}
                title="Aparat Video Player"
                className="w-full h-full border-0"
                allow="autoplay"
                allowFullScreen
              />
            </div>
          ) : (
            /* HTML5 Native Player (Direct URL / Computer File) */
            <video
              ref={videoRef}
              src={localVideoUrl || undefined}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onClick={handleTogglePlay}
              className="w-full h-full object-contain cursor-pointer"
              playsInline
            />
          )}

          {/* Controls Overlay */}
          <AnimatePresence>
            {showControls && (
              <VideoControls
                isPlaying={currentVideo.isPlaying}
                currentTime={currentVideo.sourceType === 'youtube' || currentVideo.sourceType === 'aparat' ? currentVideo.currentTime : currentTime}
                duration={currentVideo.sourceType === 'youtube' || currentVideo.sourceType === 'aparat' ? currentVideo.duration : duration}
                volume={volume}
                isMuted={isMuted}
                quality={currentVideo.quality}
                videoTitle={currentVideo.title}
                onTogglePlay={handleTogglePlay}
                onSeek={(time) => {
                  if (videoRef.current) videoRef.current.currentTime = time;
                  seekVideo(time);
                }}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
                onToggleFullscreen={handleToggleFullscreen}
                onQualityChange={setVideoQuality}
                isFullscreen={isFullscreen}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// Helpers
function getYouTubeID(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') return urlObj.pathname.substring(1);
    return urlObj.searchParams.get('v') || '';
  } catch (e) {
    const parts = url.split('v=');
    if (parts[1]) return parts[1].split('&')[0];
    return '';
  }
}

function getAparatID(url: string): string {
  try {
    const parts = url.split('/');
    return parts[parts.length - 1] || parts[parts.length - 2] || '';
  } catch (e) {
    return '';
  }
}
