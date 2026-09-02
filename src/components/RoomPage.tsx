import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRoom } from '../hooks/useRoom';
import { RoomHeader } from './RoomHeader';
import { VideoPlayer } from './VideoPlayer';
import { MembersPanel } from './MembersPanel';
import { ChatPanel } from './ChatPanel';
import { MediaSourcePanel } from './MediaSourcePanel';
import { CallControls } from './CallControls';

export function RoomPage() {
  const { roomState } = useRoom();
  const [showChat, setShowChat] = useState(true);
  const [showMembers, setShowMembers] = useState(true);

  // Responsive default adjustments: On smaller screens, start with panels closed to prevent clutter
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setShowChat(false);
        setShowMembers(false);
      } else {
        setShowChat(true);
        setShowMembers(true);
      }
    };

    handleResize(); // trigger once on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!roomState) return null;

  const isSidebarVisible = showChat || showMembers;

  return (
    <div className="flex flex-col min-h-screen bg-[#090a0f] text-[#f5f5f7]" id="room-page-layout">
      {/* Header */}
      <RoomHeader />

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row p-4 md:p-6 gap-6 overflow-hidden">
        
        {/* Main Theater Screen Area (Right in RTL, expands to full width if sidebar is closed) */}
        <div className="flex-1 flex flex-col gap-6 order-1 lg:order-2">
          {/* Theater Screen Canvas */}
          <div className="w-full">
            <VideoPlayer />
          </div>

          {/* Media source and Controls panel layout */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Source selector */}
            <div className="md:col-span-12">
              <MediaSourcePanel />
            </div>
          </div>

          {/* Persistent bottom Call Controls bar */}
          <div className="mt-auto">
            <CallControls
              showChat={showChat}
              onToggleChat={() => setShowChat(!showChat)}
              showMembers={showMembers}
              onToggleMembers={() => setShowMembers(!showMembers)}
            />
          </div>
        </div>

        {/* Sidebar Panel Area (Left in RTL, Collapsible) */}
        <AnimatePresence mode="popLayout">
          {isSidebarVisible && (
            <motion.div
              initial={{ opacity: 0, width: 0, x: -50 }}
              animate={{ opacity: 1, width: window.innerWidth < 1024 ? '100%' : 360, x: 0 }}
              exit={{ opacity: 0, width: 0, x: -50 }}
              transition={{ type: 'spring', damping: 25, stiffness: 120 }}
              className="w-full lg:w-[360px] flex flex-col gap-4 shrink-0 order-2 lg:order-1 h-[600px] lg:h-auto"
              id="room-sidebars-container"
            >
              {/* Members panel section */}
              {showMembers && (
                <div className="flex-1 min-h-[220px]">
                  <MembersPanel />
                </div>
              )}

              {/* Chat panel section */}
              {showChat && (
                <div className="flex-2 min-h-[300px]">
                  <ChatPanel />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
