import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, UserPlus, User, Key, Loader2 } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

export function JoinRoom() {
  const { joinRoom, setView, roomState, pendingRoomId, error: globalError, clearError, isLoading } = useRoom();
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [localError, setLocalError] = useState('');

  // Prefill room code if present in active state or URL query
  useEffect(() => {
    if (pendingRoomId) {
      setRoomCode(pendingRoomId);
    } else if (roomState?.roomId) {
      setRoomCode(roomState.roomId);
    }
  }, [roomState, pendingRoomId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    const cleanName = userName.trim();
    if (!cleanName) {
      setLocalError('لطفاً نام خود را وارد کنید.');
      return;
    }

    let cleanCode = roomCode.trim();
    if (!cleanCode) {
      setLocalError('لطفاً کد اتاق را وارد کنید.');
      return;
    }

    // If user pasted a full URL like https://domain.com/room/8Kx29LmP or /room/8Kx29LmP
    if (cleanCode.includes('/room/')) {
      const parts = cleanCode.split('/room/');
      cleanCode = parts[parts.length - 1].split('?')[0].split('#')[0].trim();
    }

    setLocalError('');
    await joinRoom(cleanName, cleanCode);
  };

  const displayError = localError || globalError;

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4" id="join-room-container">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-8 rounded-2xl border border-zinc-800 bg-[#12141c] shadow-xl"
      >
        {/* Back Button */}
        <button
          onClick={() => {
            clearError();
            setView('home');
          }}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm mb-6 transition-colors cursor-pointer"
          id="btn-back-to-home-from-join"
        >
          <ArrowRight className="h-4 w-4" />
          <span>بازگشت به صفحه اصلی</span>
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">ورود به اتاق واچ پارتی</h2>
            <p className="text-xs text-zinc-400 mt-1">با وارد کردن کد اختصاصی یا لینک اتاق به جمع دوستان بپیوندید.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {displayError && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl text-right"
            >
              {displayError}
            </motion.div>
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
                value={userName}
                onChange={(e) => {
                  setUserName(e.target.value);
                  if (localError) setLocalError('');
                }}
                placeholder="مثال: سهراب"
                className="w-full pr-10 pl-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-right"
                id="input-join-user-name"
                disabled={isLoading}
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              کد یا لینک اتاق <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-500 pointer-events-none">
                <Key className="h-5 w-5" />
              </span>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value);
                  if (localError) setLocalError('');
                }}
                placeholder="مثال: 8Kx29LmP یا لینک کامل"
                className="w-full pr-10 pl-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-right font-mono text-sm"
                id="input-join-room-code"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/10 transition-all cursor-pointer text-center mt-2 flex items-center justify-center gap-2 disabled:opacity-60"
            id="btn-submit-join-room"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>در حال بررسی اتاق و اتصال...</span>
              </>
            ) : (
              <span>ورود به اتاق</span>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
