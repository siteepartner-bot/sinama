import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Film, Sparkles, User, Loader2 } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

export function CreateRoom() {
  const { createRoom, setView, isLoading } = useRoom();
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setError('لطفاً نام خود را وارد کنید.');
      return;
    }
    setError('');

    try {
      await createRoom(userName.trim(), roomName.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در ایجاد اتاق';
      setError(msg);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4" id="create-room-container">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md p-8 rounded-2xl border border-zinc-800 bg-[#12141c] shadow-xl"
      >
        {/* Back Button */}
        <button
          onClick={() => setView('home')}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm mb-6 transition-colors cursor-pointer"
          id="btn-back-to-home"
        >
          <ArrowRight className="h-4 w-4" />
          <span>بازگشت به صفحه اصلی</span>
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">ساخت اتاق واچ پارتی</h2>
            <p className="text-xs text-zinc-400 mt-1">شناسه یکتای اتاق تولید شده و شما میزبان (Host) خواهید بود.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl text-right"
            >
              {error}
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
                  if (error) setError('');
                }}
                placeholder="مثال: حسن"
                className="w-full pr-10 pl-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-right"
                id="input-user-name"
                disabled={isLoading}
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">نام اتاق (اختیاری)</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-500 pointer-events-none">
                <Sparkles className="h-5 w-5" />
              </span>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="مثال: دورهمی سینمایی جمعه شب"
                className="w-full pr-10 pl-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-right"
                id="input-room-name"
                disabled={isLoading}
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5">
              در صورت خالی گذاشتن، نام اتاق به شکل «اتاق [نام شما]» ساخته خواهد شد.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-500/10 transition-all cursor-pointer text-center mt-2 flex items-center justify-center gap-2 disabled:opacity-60"
            id="btn-submit-create-room"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>در حال ایجاد اتاق و شناسه یکتا...</span>
              </>
            ) : (
              <span>ایجاد اتاق و دریافت لینک</span>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
