import { useRoom } from '../hooks/useRoom';
import { VideoPlayerCore } from './player/VideoPlayerCore';
import { SyncedPlaybackBar } from './player/SyncedPlaybackBar';

interface VideoPlayerProps {
  onOpenSourcePanel?: () => void;
}

export function VideoPlayer({ onOpenSourcePanel }: VideoPlayerProps) {
  const {
    roomState,
    currentUser,
    isHost,
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

  // Synced Bar Actions (Available for BOTH users / sides)
  const handleTogglePlay = () => {
    if (!roomState?.mediaState) return;
    const currentState = roomState.mediaState.isPlaying;
    const currentTime = roomState.mediaState.currentTime || 0;
    setVideoPlaying(!currentState, currentTime);
  };

  const handleRewind = (seconds: number = 10) => {
    if (!roomState?.mediaState) return;
    const currentTime = roomState.mediaState.currentTime || 0;
    const newTime = Math.max(0, currentTime - seconds);
    seekVideo(newTime, roomState.mediaState.isPlaying);
  };

  const handleForward = (seconds: number = 10) => {
    if (!roomState?.mediaState) return;
    const currentTime = roomState.mediaState.currentTime || 0;
    const newTime = currentTime + seconds;
    seekVideo(newTime, roomState.mediaState.isPlaying);
  };

  const handleStop = () => {
    if (!roomState?.mediaState) return;
    seekVideo(0, false);
    setVideoPlaying(false, 0);
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

      {/* Synchronized 2-way playback toolbar for all participants */}
      {roomState?.mediaState?.sourceType && (
        <SyncedPlaybackBar
          isPlaying={roomState.mediaState.isPlaying}
          currentTime={roomState.mediaState.currentTime || 0}
          duration={roomState.mediaState.duration || 0}
          sourceTitle={roomState.mediaState.title}
          sourceType={roomState.mediaState.sourceType}
          lastUpdatedByName={roomState.mediaState.updatedByName}
          isHost={isHost}
          usersCount={roomState.users?.length || 1}
          onTogglePlay={handleTogglePlay}
          onRewind={handleRewind}
          onForward={handleForward}
          onStop={handleStop}
        />
      )}
    </div>
  );
}
