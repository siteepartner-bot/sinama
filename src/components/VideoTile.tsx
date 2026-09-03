import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, Crown, VolumeX, Volume2, User as UserIcon } from 'lucide-react';
import { PeerConnectionState } from '../types';

interface VideoTileProps {
  key?: React.Key;
  stream?: MediaStream | null;
  userName: string;
  isLocal: boolean;
  isHost?: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  callJoined?: boolean;
  connectionState?: PeerConnectionState;
  id?: string;
}

export function VideoTile({
  stream,
  userName,
  isLocal,
  isHost,
  micEnabled,
  cameraEnabled,
  callJoined = true,
  connectionState = 'connected',
  id
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasAudioPlaybackError, setHasAudioPlaybackError] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);

  // Attach MediaStream to HTMLVideoElement
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      videoEl.srcObject = stream;
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlayingVideo(true);
            setHasAudioPlaybackError(false);
          })
          .catch((err) => {
            console.warn(`[VIDEO TILE PLAYBACK WARNING] (${userName}):`, err);
            // If autoplay was prevented on remote audio, flag it for user interaction
            if (!isLocal) {
              setHasAudioPlaybackError(true);
            }
          });
      }
    } else {
      videoEl.srcObject = null;
      setIsPlayingVideo(false);
    }
  }, [stream, isLocal, userName]);

  const handleManualAudioResume = () => {
    if (videoRef.current) {
      videoRef.current
        .play()
        .then(() => {
          setHasAudioPlaybackError(false);
        })
        .catch((err) => console.error('Audio resume failed', err));
    }
  };

  const hasVideoStream = !!(stream && stream.getVideoTracks().length > 0 && cameraEnabled);
  const initials = userName.trim().slice(0, 2) || 'کاربر';

  return (
    <div
      id={id || `video-tile-${userName}`}
      className="relative flex flex-col items-center justify-center bg-[#10121a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-lg aspect-video w-full transition-all group"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // ALWAYS mute local video to prevent echo feedback loop
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          hasVideoStream ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
        } ${isLocal ? 'transform scale-x-[-1]' : ''}`} // Mirror local webcam
      />

      {/* Avatar Fallback Card when Camera is Off */}
      {!hasVideoStream && (
        <div className="flex flex-col items-center justify-center p-4 text-center z-10 select-none">
          <div className="relative mb-3">
            {/* Speaking / Audio Ripple Ring */}
            {micEnabled && callJoined && (
              <span className="absolute -inset-2 rounded-full bg-emerald-500/20 animate-ping" />
            )}
            <div
              className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center font-bold text-lg border-2 shadow-inner transition-transform duration-300 ${
                isLocal
                  ? 'bg-rose-600/90 border-rose-400 text-white'
                  : 'bg-zinc-800/90 border-zinc-700 text-zinc-100'
              }`}
            >
              {initials}
            </div>
            {/* Crown if Host */}
            {isHost && (
              <span
                className="absolute -top-2 -right-2 p-1 bg-amber-500 text-zinc-950 rounded-full shadow-md"
                title="میزبان اتاق"
              >
                <Crown className="h-3 w-3 fill-current" />
              </span>
            )}
          </div>

          <span className="text-sm font-bold text-zinc-200 truncate max-w-[150px]">
            {userName} {isLocal && '(شما)'}
          </span>

          <span className="text-[11px] text-zinc-500 mt-0.5">
            {!callJoined
              ? 'هنوز به تماس متصل نشده'
              : micEnabled
              ? 'میکروفون فعال'
              : 'میکروفون قطع'}
          </span>
        </div>
      )}

      {/* Autoplay blocked banner for remote streams */}
      {hasAudioPlaybackError && !isLocal && (
        <button
          onClick={handleManualAudioResume}
          className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
        >
          <VolumeX className="h-7 w-7 mb-2 animate-bounce" />
          <span className="text-xs font-bold">برای فعال کردن صدای کاربر کلیک کنید</span>
        </button>
      )}

      {/* Overlay Header Badges (Top) */}
      <div className="absolute top-2.5 right-2.5 left-2.5 flex items-center justify-between z-20 pointer-events-none">
        {/* User identification badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg text-xs font-semibold text-zinc-100 shadow">
          {isHost && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
          <span className="truncate max-w-[120px]">{userName}</span>
          {isLocal && <span className="text-rose-400 text-[10px] font-bold">(شما)</span>}
        </div>

        {/* Connection State Badge if connecting or failed */}
        {!isLocal && connectionState && connectionState !== 'connected' && (
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-medium backdrop-blur-md">
            {connectionState === 'connecting'
              ? 'در حال اتصال...'
              : connectionState === 'failed'
              ? 'قطع ارتباط'
              : connectionState}
          </span>
        )}
      </div>

      {/* Overlay Status Badges (Bottom) */}
      <div className="absolute bottom-2.5 right-2.5 left-2.5 flex items-center justify-between z-20 pointer-events-none">
        {/* Audio status badge */}
        <div
          className={`p-1.5 rounded-lg backdrop-blur-md border shadow transition-colors ${
            micEnabled
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
          }`}
          title={micEnabled ? 'میکروفون فعال' : 'میکروفون قطع'}
        >
          {micEnabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        </div>

        {/* Camera status badge */}
        <div
          className={`p-1.5 rounded-lg backdrop-blur-md border shadow transition-colors ${
            cameraEnabled
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
              : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400'
          }`}
          title={cameraEnabled ? 'دوربین روشن' : 'دوربین خاموش'}
        >
          {cameraEnabled ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
        </div>
      </div>
    </div>
  );
}
