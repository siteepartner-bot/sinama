import { motion } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, MessageSquare, Users, PhoneOff } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { ScreenShareButton } from './ScreenShareButton';

interface CallControlsProps {
  showChat: boolean;
  onToggleChat: () => void;
  showMembers: boolean;
  onToggleMembers: () => void;
}

export function CallControls({
  showChat,
  onToggleChat,
  showMembers,
  onToggleMembers,
}: CallControlsProps) {
  const { currentUser, toggleMic, toggleCamera, toggleScreenShare, leaveRoom } = useRoom();

  if (!currentUser) return null;

  const isMicActive = currentUser.micEnabled;
  const isCameraActive = currentUser.cameraEnabled;
  const isScreenSharing = !!currentUser.screenSharingEnabled;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#12141c] border border-zinc-800/80 rounded-2xl shadow-xl w-full" id="call-controls-container">
      {/* Current user badge (Left) */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-xs font-semibold text-zinc-300">اتاق فعال</span>
        <span className="text-[11px] text-zinc-500">({currentUser.name})</span>
      </div>

      {/* Main AV Controls (Center) */}
      <div className="flex items-center gap-3">
        {/* Mic Toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleMic}
          className={`p-3 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
            isMicActive
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/25'
          }`}
          title={isMicActive ? 'قطع میکروفون' : 'فعال‌سازی میکروفون'}
          id="btn-mic-toggle"
        >
          {isMicActive ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </motion.button>

        {/* Camera Toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleCamera}
          className={`p-3 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
            isCameraActive
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/25'
          }`}
          title={isCameraActive ? 'قطع دوربین' : 'فعال‌سازی دوربین'}
          id="btn-camera-toggle"
        >
          {isCameraActive ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </motion.button>

        {/* Screen Share Button */}
        <ScreenShareButton isSharing={isScreenSharing} onClick={toggleScreenShare} />

        {/* Leave Room (Red Button) */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={leaveRoom}
          className="p-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl border border-rose-500/30 flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-rose-500/15"
          title="خروج از اتاق"
          id="btn-leave-call"
        >
          <PhoneOff className="h-5 w-5" />
        </motion.button>
      </div>

      {/* View Toggles (Right) */}
      <div className="flex items-center gap-2">
        {/* Members Toggle */}
        <button
          onClick={onToggleMembers}
          className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold transition-all cursor-pointer ${
            showMembers
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          id="btn-toggle-members-panel"
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">اعضا</span>
        </button>

        {/* Chat Toggle */}
        <button
          onClick={onToggleChat}
          className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold transition-all cursor-pointer ${
            showChat
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
          id="btn-toggle-chat-panel"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">چت</span>
        </button>
      </div>
    </div>
  );
}
