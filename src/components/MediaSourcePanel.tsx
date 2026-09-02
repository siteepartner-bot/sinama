import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Youtube, Play, Globe, Laptop, Upload, Link2, Sparkles } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';

type TabType = 'youtube' | 'aparat' | 'direct' | 'local';

export function MediaSourcePanel() {
  const { changeVideoSource } = useRoom();
  const [activeTab, setActiveTab] = useState<TabType>('youtube');
  
  // URL Input states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [aparatUrl, setAparatUrl] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;
    changeVideoSource('youtube', youtubeUrl.trim());
  };

  const handleAparatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aparatUrl.trim()) return;
    changeVideoSource('aparat', aparatUrl.trim());
  };

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!directUrl.trim()) return;
    changeVideoSource('direct', directUrl.trim());
  };

  // Convert computer file selection to local object URL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadLocalFile(file);
    }
  };

  const loadLocalFile = (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    changeVideoSource('local', fileUrl, file.name);
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      loadLocalFile(file);
    }
  };

  const loadSample = (type: TabType) => {
    if (type === 'youtube') {
      setYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    } else if (type === 'aparat') {
      setAparatUrl('https://www.aparat.com/v/vM82f');
    } else if (type === 'direct') {
      setDirectUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    }
  };

  const tabs = [
    { id: 'youtube', label: 'یوتیوب', icon: Youtube, color: 'text-red-500' },
    { id: 'aparat', label: 'آپارات', icon: Play, color: 'text-orange-400' },
    { id: 'direct', label: 'لینک مستقیم ویدیو', icon: Globe, color: 'text-blue-400' },
    { id: 'local', label: 'کامپیوتر شما', icon: Laptop, color: 'text-amber-400' },
  ];

  return (
    <div className="bg-[#12141c] border border-zinc-800/60 rounded-2xl p-4 flex flex-col h-full" id="video-source-panel">
      {/* Title */}
      <h3 className="text-sm font-bold text-zinc-100 mb-4 flex items-center gap-2">
        <Link2 className="h-4.5 w-4.5 text-rose-500" />
        <span>منبع پخش ویدیو</span>
      </h3>

      {/* Tabs list */}
      <div className="flex border-b border-zinc-800 pb-2 mb-4 overflow-x-auto gap-2 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${isActive ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'text-zinc-400 hover:text-zinc-200 border border-transparent'}`}
            >
              <Icon className={`h-4 w-4 ${tab.color}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 flex flex-col justify-center">
        {activeTab === 'youtube' && (
          <form onSubmit={handleYoutubeSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">آدرس ویدیوی یوتیوب را وارد کنید:</label>
              <button
                type="button"
                onClick={() => loadSample('youtube')}
                className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span>بارگذاری لینک نمونه</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 px-3.5 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-left dir-ltr"
                id="yt-url-input"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                id="yt-play-btn"
              >
                پخش
              </button>
            </div>
          </form>
        )}

        {activeTab === 'aparat' && (
          <form onSubmit={handleAparatSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">آدرس ویدیوی آپارات را وارد کنید:</label>
              <button
                type="button"
                onClick={() => loadSample('aparat')}
                className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span>بارگذاری لینک نمونه</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={aparatUrl}
                onChange={(e) => setAparatUrl(e.target.value)}
                placeholder="https://www.aparat.com/v/..."
                className="flex-1 px-3.5 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-left dir-ltr"
                id="aparat-url-input"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                id="aparat-play-btn"
              >
                پخش
              </button>
            </div>
          </form>
        )}

        {activeTab === 'direct' && (
          <form onSubmit={handleDirectSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">لینک مستقیم فایل ویدیو (MP4/MKV):</label>
              <button
                type="button"
                onClick={() => loadSample('direct')}
                className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="h-3 w-3" />
                <span>بارگذاری لینک نمونه</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={directUrl}
                onChange={(e) => setDirectUrl(e.target.value)}
                placeholder="https://example.com/movie.mp4"
                className="flex-1 px-3.5 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-left dir-ltr"
                id="direct-url-input"
                required
              />
              <button
                type="submit"
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                id="direct-play-btn"
              >
                پخش
              </button>
            </div>
          </form>
        )}

        {activeTab === 'local' && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${isDragOver ? 'border-rose-500 bg-rose-500/5' : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50'}`}
            id="drag-and-drop-container"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
              className="hidden"
            />
            <Upload className="h-8 w-8 text-rose-400/80 mb-2 animate-bounce" />
            <h4 className="text-xs font-bold text-zinc-300">انتخاب فایل ویدیو از کامپیوتر</h4>
            <p className="text-[10px] text-zinc-500 mt-1.5 text-center leading-relaxed">
              فایل را به اینجا بکشید یا برای انتخاب کلیک کنید <br />
              (تطابق ۱۰۰٪ با حریم خصوصی - فایل شما روی سرور آپلود نمی‌شود)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
