import { useRoom } from '../hooks/useRoom';
import { VideoPlayerCore } from './player/VideoPlayerCore';

export function VideoPlayer() {
  const { roomState, changeVideoSource } = useRoom();

  const handleSelectSample = (type: 'youtube' | 'aparat' | 'direct') => {
    if (type === 'youtube') {
      changeVideoSource('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Rick Astley - Never Gonna Give You Up');
    } else if (type === 'aparat') {
      changeVideoSource('aparat', 'https://www.aparat.com/v/vM82f', 'ویدیوی نمونه آپارات');
    } else if (type === 'direct') {
      changeVideoSource('direct', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', 'Big Buck Bunny (Sample HD Video)');
    }
  };

  return (
    <div className="w-full flex flex-col" id="main-video-player-section">
      <VideoPlayerCore
        mediaState={roomState?.mediaState || null}
        onSelectSampleSource={handleSelectSample}
      />
    </div>
  );
}
