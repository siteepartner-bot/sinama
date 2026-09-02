import { motion } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, Users, Monitor } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

export function MembersPanel() {
  const { roomState } = useRoom();

  if (!roomState) return null;

  const onlineMembersCount = roomState.members.filter(m => m.isOnline).length;

  return (
    <div className="flex flex-col h-full bg-[#12141c] border border-zinc-800/60 rounded-2xl overflow-hidden p-4" id="members-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-4">
        <div className="flex items-center gap-2 text-zinc-100">
          <Users className="h-5 w-5 text-rose-500" />
          <h3 className="font-bold text-sm">اعضای اتاق</h3>
        </div>
        <span className="text-xs px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-400 font-medium">
          {onlineMembersCount} از {roomState.members.length} آنلاین
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-0.5">
        {roomState.members.map((member) => (
          <motion.div
            key={member.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-center justify-between p-2.5 rounded-xl border ${member.isMe ? 'bg-rose-500/5 border-rose-500/15' : 'bg-zinc-900/40 border-zinc-900/60'} hover:bg-zinc-900/80 transition-colors`}
          >
            {/* Avatar & Name */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${member.isMe ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                  {member.name.substring(0, 2)}
                </div>
                {/* Online status indicator */}
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#12141c] ${member.isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-zinc-200">{member.name}</span>
                  {member.isMe && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/10 text-rose-400 rounded-md font-medium">
                      من
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500">
                  {member.isOnline ? 'حاضر در اتاق' : 'آفلاین'}
                </span>
              </div>
            </div>

            {/* AV Status Controls (Displays state) */}
            <div className="flex items-center gap-1.5">
              {/* Screen Sharing badge */}
              {member.isScreenSharing && (
                <div className="p-1 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg animate-pulse" title="در حال اشتراک صفحه">
                  <Monitor className="h-3.5 w-3.5" />
                </div>
              )}
              
              {/* Mic status indicator */}
              <div className={`p-1.5 rounded-lg border ${member.isMicActive ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-600'}`}>
                {member.isMicActive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
              </div>

              {/* Camera status indicator */}
              <div className={`p-1.5 rounded-lg border ${member.isCameraActive ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-zinc-900 border-zinc-800 text-zinc-600'}`}>
                {member.isCameraActive ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
