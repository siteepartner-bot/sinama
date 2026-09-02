import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Send, Bell } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

export function ChatPanel() {
  const { roomState, sendChatMessage } = useRoom();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  if (!roomState) return null;

  // Auto-scroll to bottom of chat list
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomState.chatMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendChatMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-[#12141c] border border-zinc-800/60 rounded-2xl overflow-hidden p-4" id="chat-panel">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3 mb-4 text-zinc-100">
        <MessageSquare className="h-5 w-5 text-rose-500" />
        <h3 className="font-bold text-sm">گفتگو و چت آنلاین</h3>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-0.5 custom-scrollbar mb-4 flex flex-col">
        {roomState.chatMessages.map((msg) => {
          const isMe = msg.senderId === roomState.currentUser?.id;
          const isSystem = msg.senderId === 'system';

          if (isSystem) {
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-center gap-1.5 self-center bg-zinc-900/50 border border-zinc-800/80 text-zinc-400 text-xs py-1.5 px-4 rounded-xl max-w-[90%]"
              >
                <Bell className="h-3.5 w-3.5 text-rose-400" />
                <span>{msg.text}</span>
              </motion.div>
            );
          }

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
            >
              {/* Sender Name */}
              <span className="text-[10px] text-zinc-500 mb-1 px-1">
                {isMe ? 'شما' : msg.senderName}
              </span>

              {/* Message Bubble */}
              <div
                className={`py-2 px-3 rounded-2xl text-sm leading-relaxed ${isMe ? 'bg-rose-500 text-white rounded-tr-none' : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none'}`}
              >
                <p className="whitespace-pre-wrap break-all">{msg.text}</p>
              </div>

              {/* Timestamp */}
              <span className="text-[9px] text-zinc-600 mt-0.5 px-1 font-mono">
                {msg.timestamp}
              </span>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="پیامی بنویسید..."
          className="flex-1 px-4 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-200 placeholder-zinc-600 text-sm focus:outline-none focus:border-rose-500 transition-colors text-right"
          id="chat-input-field"
        />
        <button
          type="submit"
          className="p-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-colors cursor-pointer"
          id="chat-send-btn"
        >
          <Send className="h-4 w-4 -rotate-90" />
        </button>
      </form>
    </div>
  );
}
