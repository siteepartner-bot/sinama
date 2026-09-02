import { useRoom } from '../hooks/useRoom';
import { VideoPlayerCore } from './player/VideoPlayerCore';

interface VideoPlayerProps {
  onOpenSourcePanel?: () => void;
}

export function VideoPlayer({ onOpenSourcePanel }: VideoPlayerProps) {
  const {
    roomState,
    currentUser,
    changeVideoSource,
    setVideoPlaying,
    seekVideo,
    setPlaybackRate,
    handleVideoEnded
  } = useRoom();

  const handleSelectSample = (type: 'youtube' | 'aparat' | 'direct') => {
    if (type === 'youtube') {
      changeVideoSource('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Rick Astley - Never Gonna Give You Up');
    } else if (type === 'aparat') {
      changeVideoSource('aparat', 'https://www.aparat.com/v/vM82f', 'ویدیوی نمونه آپارات');
    } else if (type === 'direct') {
      changeVideoSource('direct', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 'Big Buck Bunny (ویدیوی نمونه)');
    }
  };

  const handlePlayChange = (isPlaying: boolean, currentTime: number) => {
    setVideoPlaying(isPlaying, currentTime);
  };

  const handleSeekChange = (time: number) => {
    seekVideo(time);
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
  };

  return (
    <div className="w-full flex flex-col" id="main-video-player-section">
      <VideoPlayerCore
        mediaState={roomState?.mediaState || null}
        currentUserId={currentUser?.userId}
        onPlayChange={handlePlayChange}
        onSeekChange={handleSeekChange}
        onRateChange={handleRateChange}
        onEnded={handleVideoEnded}
        onSelectSampleSource={handleSelectSample}
        onOpenSourcePanel={onOpenSourcePanel}
      />
    </div>
  );
}
