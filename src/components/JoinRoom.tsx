import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, UserPlus, User, Key } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

export function JoinRoom() {
  const { joinRoom, setView, roomState } = useRoom();
  const [userName, setUserName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');

  // Prefill room code if it exists in the active state (from URL routing)
  useEffect(() => {
    if (roomState?.roomId) {
      setRoomCode(roomState.roomId);
    }
  }, [roomState]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('لطفاً نام خود را وارد کنید.');
      return;
    }
    if (!roomCode.trim()) {
      setError('لطفاً کد اتاق را وارد کنید.');
      return;
    }
    setError('');
    const success = joinRoom(userName.trim(), roomCode.trim());
    if (!success) {
      setError('ورود به اتاق ناموفق بود.');
    }
  };

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
          onClick={() => setView('home')}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm mb-6 transition-colors"
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
            <h2 className="text-2xl font-bold text-zinc-100">ورود به اتاق دوستان</h2>
            <p className="text-xs text-zinc-400 mt-1">با وارد کردن کد اتاق یا کلیک بر روی لینک دعوت وارد شوید.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">نام شما (نام مستعار)</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500">
                <User className="h-5 w-5" />
              </span>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="مثال: آرمین"
                className="w-full pr-10 pl-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-right"
                id="input-join-user-name"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">کد یا لینک اتاق</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500">
                <Key className="h-5 w-5" />
              </span>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="مثال: abc-123"
                className="w-full pr-10 pl-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-right"
                id="input-join-room-code"
                required
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/10 transition-all cursor-pointer text-center mt-2"
            id="btn-submit-join-room"
          >
            ورود به اتاق
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
