import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Monitor, Maximize2, Minimize2, StopCircle, User } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

interface ActiveScreenShare {
  userId: string;
  userName: string;
  stream: MediaStream | null;
  isLocal: boolean;
}

export function ScreenSharePanel() {
  const {
    currentUser,
    localScreenStream,
    remoteScreenStreams,
    peerMediaStates,
    isScreenSharing,
    toggleScreenShare,
    roomState
  } = useRoom();

  const [activeTabUserId, setActiveTabUserId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Collect all active screen shares in room
  const activeShares: ActiveScreenShare[] = [];
  const processedUserIds = new Set<string>();

  // 1. Local Screen Share
  if (currentUser && isScreenSharing) {
    processedUserIds.add(currentUser.userId);
    activeShares.push({
      userId: currentUser.userId,
      userName: `${currentUser.name} (صفحه شما)`,
      stream: localScreenStream,
      isLocal: true
    });
  }

  // 2. Remote Screen Streams from remoteScreenStreams map
  remoteScreenStreams.forEach((stream, remoteUserId) => {
    if (remoteUserId === currentUser?.userId || processedUserIds.has(remoteUserId)) return;
    processedUserIds.add(remoteUserId);
    const peerState = peerMediaStates.get(remoteUserId);
    const userInRoom = roomState?.users.find((u) => u.userId === remoteUserId);
    const name = peerState?.name || userInRoom?.name || 'هم‌اتاقی';

    activeShares.push({
      userId: remoteUserId,
      userName: name,
      stream,
      isLocal: false
    });
  });

  // 3. Remote Screen Shares from peerMediaStates
  peerMediaStates.forEach((peerState, remoteUserId) => {
    if (remoteUserId === currentUser?.userId || processedUserIds.has(remoteUserId)) return;
    if (peerState.screenSharing) {
      processedUserIds.add(remoteUserId);
      const userInRoom = roomState?.users.find((u) => u.userId === remoteUserId);
      const name = peerState.name || userInRoom?.name || 'هم‌اتاقی';
      activeShares.push({
        userId: remoteUserId,
        userName: name,
        stream: peerState.screenStream || null,
        isLocal: false
      });
    }
  });

  // 4. Remote Screen Shares from roomState.users
  if (roomState) {
    roomState.users.forEach((user) => {
      if (user.userId === currentUser?.userId || processedUserIds.has(user.userId)) return;
      if (user.screenSharingEnabled) {
        processedUserIds.add(user.userId);
        activeShares.push({
          userId: user.userId,
          userName: user.name,
          stream: null,
          isLocal: false
        });
      }
    });
  }

  // Ensure an active tab is selected
  useEffect(() => {
    if (activeShares.length > 0) {
      if (!activeTabUserId || !activeShares.some((s) => s.userId === activeTabUserId)) {
        setActiveTabUserId(activeShares[0].userId);
      }
    } else {
      setActiveTabUserId(null);
    }
  }, [activeShares, activeTabUserId]);

  const currentShare = activeShares.find((s) => s.userId === activeTabUserId) || activeShares[0];

  // Attach MediaStream to <video> tag
  useEffect(() => {
    if (videoRef.current && currentShare?.stream) {
      if (videoRef.current.srcObject !== currentShare.stream) {
        videoRef.current.srcObject = currentShare.stream;
      }
      videoRef.current.play().catch((err) => {
        console.warn('Screen share video auto-play failed:', err);
        // If autoplay blocked, try playing muted
        if (videoRef.current && !videoRef.current.muted) {
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
      });
    }
  }, [currentShare?.stream, currentShare?.userId]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (activeShares.length === 0 || !currentShare) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="bg-[#12141c] border border-purple-500/30 rounded-2xl p-4 shadow-2xl transition-all w-full flex flex-col gap-3 relative group"
      id="screen-share-active-panel"
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20">
            <Monitor className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                اشتراک‌گذاری زنده صفحه
              </span>
              <span className="text-xs text-zinc-300 font-semibold">
                در حال نمایش: {currentShare.userName}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* If local user is sharing, show Stop Sharing button */}
          {currentShare.isLocal && (
            <button
              onClick={toggleScreenShare}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              title="توقف اشتراک‌گذاری صفحه"
              id="btn-panel-stop-screenshare"
            >
              <StopCircle className="h-4 w-4" />
              <span>توقف اشتراک</span>
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={handleToggleFullscreen}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title={isFullscreen ? 'خروج از حالت تمام‌صفحه' : 'نمایش تمام‌صفحه صفحه اشتراکی'}
            id="btn-screenshare-fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Multiple Sharers Selector Tabs */}
      {activeShares.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-zinc-400 font-medium shrink-0">صفحات فعال:</span>
          {activeShares.map((share) => (
            <button
              key={share.userId}
              onClick={() => setActiveTabUserId(share.userId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                activeTabUserId === share.userId
                  ? 'bg-purple-600 text-white font-bold shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>{share.userName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Video Container */}
      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center">
        {currentShare.stream && currentShare.stream.getVideoTracks().length > 0 ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={currentShare.isLocal} // mute local screen to avoid echo
            className="w-full h-full object-contain bg-black"
            id={`screen-video-${currentShare.userId}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="p-3 bg-purple-500/10 rounded-full border border-purple-500/20 animate-pulse">
              <Monitor className="h-8 w-8 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-200">
                {currentShare.userName} در حال اشتراک‌گذاری صفحه است
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                در حال دریافت تصویر زنده از طریق ارتباط مستقیم WebRTC...
              </p>
            </div>
          </div>
        )}

        {/* Bottom Overlay Label */}
        <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 text-xs text-zinc-200 font-medium flex items-center gap-2 pointer-events-none">
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          <span>صفحه نمایش {currentShare.userName}</span>
        </div>
      </div>
    </div>
  );
}
