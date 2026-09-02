import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, ArrowRight, Film, Loader2, User, UserPlus, Sparkles } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { RoomHeader } from './RoomHeader';
import { VideoPlayer } from './VideoPlayer';
import { MembersPanel } from './MembersPanel';
import { ChatPanel } from './ChatPanel';
import { MediaSourcePanel } from './MediaSourcePanel';
import { CallControls } from './CallControls';

export function RoomPage() {
  const {
    roomState,
    currentUser,
    isLoading,
    error,
    pendingRoomId,
    setView,
    joinDirectly,
    clearError
  } = useRoom();

  const [showChat, setShowChat] = useState(true);
  const [showMembers, setShowMembers] = useState(true);
  const [directUserName, setDirectUserName] = useState('');
  const [directJoinError, setDirectJoinError] = useState('');
  const [isJoiningDirectly, setIsJoiningDirectly] = useState(false);

  // Responsive default adjustments
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

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4" id="room-loading-state">
        <div className="p-8 rounded-2xl border border-zinc-800 bg-[#12141c] text-center max-w-sm w-full flex flex-col items-center shadow-2xl">
          <div className="p-4 bg-rose-500/10 rounded-2xl text-rose-500 mb-4 animate-pulse">
            <Film className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-zinc-100 mb-2">در حال بارگذاری اتاق...</h3>
          <p className="text-xs text-zinc-400 mb-6">در حال اتصال و برقراری ارتباط با سرویس ابری</p>
          <Loader2 className="h-6 w-6 text-rose-500 animate-spin" />
        </div>
      </div>
    );
  }

  // 2. Direct Invitation or Activation Entry Prompt (when user visits a room URL but hasn't entered their name yet)
  if (!currentUser) {
    const targetCode = roomState?.roomId || pendingRoomId || '1234';
    const roomTitle = roomState?.roomName || `اتاق شماره ${targetCode}`;

    const handleDirectJoinSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!directUserName.trim()) {
        setDirectJoinError('لطفاً نام خود را وارد کنید.');
        return;
      }
      setDirectJoinError('');
      setIsJoiningDirectly(true);
      try {
        const success = await joinDirectly(directUserName.trim());
        if (!success) {
          setDirectJoinError('خطا در ورود به اتاق، لطفاً مجدداً تلاش کنید.');
        }
      } catch (err: unknown) {
        setDirectJoinError(err instanceof Error ? err.message : 'خطا در ورود به اتاق');
      } finally {
        setIsJoiningDirectly(false);
      }
    };

    return (
      <div className="flex items-center justify-center min-h-[85vh] px-4" id="direct-join-prompt">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 rounded-2xl border border-zinc-800 bg-[#12141c] shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
              <UserPlus className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 font-mono">
                کد اتاق: {targetCode}
              </span>
              <h2 className="text-xl font-bold text-zinc-100 mt-1">{roomTitle}</h2>
            </div>
          </div>

          <p className="text-sm text-zinc-300 mb-6 leading-relaxed bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-800">
            برای ورود به این سالن تماشا و هماهنگی پخش فیلم با دوستان، لطفاً نام یا نام مستعار خود را وارد کنید.
          </p>

          <form onSubmit={handleDirectJoinSubmit} className="space-y-4">
            {directJoinError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl text-right">
                {directJoinError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                نام شما (نام مستعار) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-500 pointer-events-none">
                  <User className="h-5 w-5" />
                </span>
                <input
                  type="text"
                  value={directUserName}
                  onChange={(e) => {
                    setDirectUserName(e.target.value);
                    if (directJoinError) setDirectJoinError('');
                  }}
                  placeholder="مثال: علی"
                  className="w-full pr-10 pl-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-right"
                  id="input-direct-user-name"
                  disabled={isJoiningDirectly}
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isJoiningDirectly}
              className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/15 transition-all cursor-pointer text-center mt-2 flex items-center justify-center gap-2 disabled:opacity-60"
              id="btn-submit-direct-join"
            >
              {isJoiningDirectly ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>در حال ورود...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>ورود به سالن تماشا</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <button
              onClick={() => {
                clearError();
                setView('join-room');
              }}
              className="hover:text-zinc-200 transition-colors cursor-pointer"
            >
              ورود با کد دیگر
            </button>
            <button
              onClick={() => {
                clearError();
                setView('home');
              }}
              className="flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <ArrowRight className="h-3 w-3" />
              <span>صفحه اصلی</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 3. Fallback error state if something went wrong
  if (error || !roomState) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4" id="room-error-state">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 rounded-2xl border border-zinc-800 bg-[#12141c] text-center shadow-2xl"
        >
          <div className="inline-flex p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 mb-5">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">عدم دسترسی به اتاق</h2>
          <p className="text-sm text-zinc-400 leading-relaxed mb-8">
            {error || 'مشکلی در اتصال به این اتاق پیش آمد.'}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                clearError();
                setView('create-room');
              }}
              className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-500/15"
              id="btn-error-create-room"
            >
              ساخت اتاق ۴ رقمی جدید
            </button>
            <button
              onClick={() => {
                clearError();
                setView('join-room');
              }}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl border border-zinc-700 transition-all cursor-pointer"
              id="btn-error-join-room"
            >
              ورود با کد دیگر
            </button>
            <button
              onClick={() => {
                clearError();
                setView('home');
              }}
              className="flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm mt-2 transition-colors cursor-pointer"
              id="btn-error-back-home"
            >
              <ArrowRight className="h-4 w-4" />
              <span>بازگشت به صفحه اصلی</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 4. Normal Room Active View
  const isSidebarVisible = showChat || showMembers;

  return (
    <div className="flex flex-col min-h-screen bg-[#090a0f] text-[#f5f5f7]" id="room-page-layout">
      {/* Header */}
      <RoomHeader />

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row p-4 md:p-6 gap-6 overflow-hidden">
        
        {/* Main Theater Screen Area */}
        <div className="flex-1 flex flex-col gap-6 order-1 lg:order-2">
          {/* Theater Screen Canvas */}
          <div className="w-full">
            <VideoPlayer />
          </div>

          {/* Media source selector */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
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

        {/* Sidebar Panel Area */}
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
