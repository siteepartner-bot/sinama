import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhoneCall, Mic, Video, Users, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { VideoTile } from './VideoTile';

interface CallGridProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function CallGrid({ isCollapsed = false, onToggleCollapse }: CallGridProps) {
  const {
    roomState,
    currentUser,
    localStream,
    remoteStreams,
    peerMediaStates,
    isInCall,
    joinCall,
    toggleMic,
    toggleCamera
  } = useRoom();

  if (!roomState || !currentUser) return null;

  // Remote users in room (excluding local user)
  const remoteUsers = roomState.users.filter((u) => u.userId !== currentUser.userId);

  // Total call count
  const callParticipantsCount =
    (isInCall ? 1 : 0) +
    remoteUsers.filter((u) => u.callJoined || peerMediaStates.get(u.userId)?.callJoined).length;

  return (
    <div
      className="bg-[#12141c] border border-zinc-800/80 rounded-2xl p-4 shadow-xl transition-all w-full flex flex-col gap-4"
      id="webrtc-call-grid-section"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-3 h-3 rounded-full ${
              isInCall ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'
            }`}
          />
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-zinc-100">تماس صوتی و تصویری اتاق</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
              {callParticipantsCount} نفر در تماس
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isInCall && (
            <button
              onClick={() => joinCall(true, false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-500/15 cursor-pointer"
              id="btn-join-call-quick"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              <span>پیوستن به تماس</span>
            </button>
          )}

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title={isCollapsed ? 'نمایش شبکه وب‌کم‌ها' : 'بستن موقت'}
            >
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Grid Content */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Call Join Invitation Banner if user hasn't joined yet */}
            {!isInCall && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-rose-950/30 to-zinc-900/60 border border-rose-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20 shrink-0">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-zinc-200">
                      میکروفون و دوربین شما هنوز متصل نشده است
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      برای گفت‌وگو با سایر اعضا، تماس را فعال کنید.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => toggleMic()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-xl border border-zinc-700 transition-colors cursor-pointer"
                    id="btn-quick-enable-mic"
                  >
                    <Mic className="h-4 w-4 text-emerald-400" />
                    <span>فقط صدا</span>
                  </button>
                  <button
                    onClick={() => joinCall(true, true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
                    id="btn-quick-enable-camera"
                  >
                    <Video className="h-4 w-4" />
                    <span>صدا و تصویر</span>
                  </button>
                </div>
              </div>
            )}

            {/* Video Tiles Grid */}
            <div
              className={`grid gap-3 w-full ${
                remoteUsers.length === 0
                  ? 'grid-cols-1 max-w-sm mx-auto'
                  : remoteUsers.length === 1
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : remoteUsers.length === 2
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
              }`}
            >
              {/* 1. Local User Video Tile */}
              <VideoTile
                stream={localStream}
                userName={currentUser.name}
                isLocal={true}
                isHost={currentUser.isHost || currentUser.userId === roomState.hostId}
                micEnabled={currentUser.micEnabled}
                cameraEnabled={currentUser.cameraEnabled}
                callJoined={isInCall}
                connectionState="connected"
                id="local-video-tile"
              />

              {/* 2. Remote Users Video Tiles */}
              {remoteUsers.map((remoteUser) => {
                const remoteStream = remoteStreams.get(remoteUser.userId) || null;
                const peerState = peerMediaStates.get(remoteUser.userId);
                const isPeerCallJoined = !!(remoteUser.callJoined || peerState?.callJoined);
                const isPeerMicOn = peerState ? peerState.micEnabled : remoteUser.micEnabled;
                const isPeerCamOn = peerState ? peerState.cameraEnabled : remoteUser.cameraEnabled;
                const connState = peerState?.connectionState || (remoteStream ? 'connected' : 'connecting');

                return (
                  <VideoTile
                    key={remoteUser.userId}
                    stream={remoteStream}
                    userName={remoteUser.name}
                    isLocal={false}
                    isHost={remoteUser.isHost || remoteUser.userId === roomState.hostId}
                    micEnabled={isPeerMicOn}
                    cameraEnabled={isPeerCamOn}
                    callJoined={isPeerCallJoined}
                    connectionState={connState}
                    id={`remote-tile-${remoteUser.userId}`}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
