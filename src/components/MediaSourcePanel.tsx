import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Youtube, Play, Globe, Laptop, Upload, Link2, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { parseYouTubeUrl, parseAparatUrl, isValidDirectVideoUrl } from '../utils/mediaParsers';

type TabType = 'youtube' | 'aparat' | 'direct' | 'local';

export function MediaSourcePanel() {
  const { changeVideoSource } = useRoom();
  const [activeTab, setActiveTab] = useState<TabType>('youtube');
  
  // URL Input states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [aparatUrl, setAparatUrl] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  
  // Error and feedback states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear messages when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const showSuccessFeedback = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 4000);
  };

  // 1. YouTube Submit
  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = parseYouTubeUrl(youtubeUrl);
    if (!parsed.isValid || !parsed.videoId) {
      setErrorMsg('لینک یوتیوب معتبر نیست. لطفاً آدرس استاندارد (مانند youtube.com/watch?v=... یا youtu.be/...) را وارد کنید.');
      return;
    }

    changeVideoSource('youtube', youtubeUrl.trim(), 'ویدیوی یوتیوب');
    showSuccessFeedback('ویدیوی یوتیوب با موفقیت بارگذاری شد.');
  };

  // 2. Aparat Submit
  const handleAparatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = parseAparatUrl(aparatUrl);
    if (!parsed.isValid || !parsed.videoHash) {
      setErrorMsg('لینک آپارات معتبر نیست.');
      return;
    }

    changeVideoSource('aparat', aparatUrl.trim(), 'ویدیوی آپارات');
    showSuccessFeedback('ویدیوی آپارات با موفقیت بارگذاری شد.');
  };

  // 3. Direct URL Submit
  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isValidDirectVideoUrl(directUrl)) {
      setErrorMsg('لینک مستقیم وارد شده نامعتبر است. آدرس باید با http:// یا https:// شروع شود.');
      return;
    }

    // Extract filename from URL if possible
    let extractedTitle = 'ویدیوی مستقیم';
    try {
      const urlObj = new URL(directUrl);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').filter(Boolean).pop();
      if (filename) {
        extractedTitle = decodeURIComponent(filename);
      }
    } catch {
      // Use fallback
    }

    changeVideoSource('direct', directUrl.trim(), extractedTitle);
    showSuccessFeedback('لینک مستقیم ویدیو با موفقیت بارگذاری شد.');
  };

  // 4. Local File Selection & Drag & Drop
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadLocalFile(file);
    }
  };

  const loadLocalFile = (file: File) => {
    setErrorMsg(null);
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|webm|mkv|mov|ogg|avi)$/i)) {
      setErrorMsg('فرمت فایل انتخابی ویدیو نیست. لطفاً یک فایل ویدیویی معتبر انتخاب کنید.');
      return;
    }

    const fileUrl = URL.createObjectURL(file);
    changeVideoSource('local', fileUrl, file.name);
    showSuccessFeedback(`فایل «${file.name}» آماده پخش است.`);
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
    if (file) {
      loadLocalFile(file);
    }
  };

  // Sample quick links
  const loadSample = (type: TabType) => {
    setErrorMsg(null);
    if (type === 'youtube') {
      const sample = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      setYoutubeUrl(sample);
      changeVideoSource('youtube', sample, 'Rick Astley - Never Gonna Give You Up (Official Music Video)');
      showSuccessFeedback('ویدیوی نمونه یوتیوب بارگذاری شد.');
    } else if (type === 'aparat') {
      const sample = 'https://www.aparat.com/v/vM82f';
      setAparatUrl(sample);
      changeVideoSource('aparat', sample, 'ویدیوی نمونه آپارات');
      showSuccessFeedback('ویدیوی نمونه آپارات بارگذاری شد.');
    } else if (type === 'direct') {
      const sample = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
      setDirectUrl(sample);
      changeVideoSource('direct', sample, 'Big Buck Bunny (Sample HD Video)');
      showSuccessFeedback('ویدیوی نمونه مستقیم بارگذاری شد.');
    }
  };

  const tabs = [
    { id: 'youtube', label: 'یوتیوب (YouTube)', icon: Youtube, color: 'text-red-500' },
    { id: 'aparat', label: 'آپارات (Aparat)', icon: Play, color: 'text-orange-400' },
    { id: 'direct', label: 'لینک مستقیم ویدیو', icon: Globe, color: 'text-blue-400' },
    { id: 'local', label: 'انتخاب از کامپیوتر', icon: Laptop, color: 'text-amber-400' },
  ];

  return (
    <div className="bg-[#12141c] border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-col h-full shadow-lg" id="video-source-panel">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Link2 className="h-4.5 w-4.5 text-rose-500" />
          <span>انتخاب منبع ویدیو</span>
        </h3>
        <span className="text-[11px] text-zinc-500">مرحله ۳: پخش لوکال ویدیو</span>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-800/80 pb-2 mb-4 overflow-x-auto gap-1.5 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id as TabType)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-transparent'
              }`}
              id={`tab-source-${tab.id}`}
            >
              <Icon className={`h-4 w-4 ${tab.color}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error / Success Feedback banner */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 p-2.5 mb-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl"
            id="source-error-banner"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2 p-2.5 mb-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl"
            id="source-success-banner"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Contents */}
      <div className="flex-1 flex flex-col justify-center">
        {/* 1. YouTube Form */}
        {activeTab === 'youtube' && (
          <form onSubmit={handleYoutubeSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">آدرس ویدیوی یوتیوب را وارد کنید:</label>
              <button
                type="button"
                onClick={() => loadSample('youtube')}
                className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                id="btn-sample-youtube"
              >
                <Sparkles className="h-3 w-3" />
                <span>بارگذاری لینک نمونه</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="https://www.youtube.com/watch?v=... یا https://youtu.be/..."
                className="flex-1 px-3.5 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-left dir-ltr"
                id="yt-url-input"
                required
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-rose-500/20 shrink-0"
                id="yt-play-btn"
              >
                پخش ویدیو
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              پشتیبانی از تمام قالب‌های رایج لینک‌های یوتیوب (لینک عادی، کوتاه youtu.be، ویدیوهای Shorts و زمان شروع)
            </p>
          </form>
        )}

        {/* 2. Aparat Form */}
        {activeTab === 'aparat' && (
          <form onSubmit={handleAparatSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">آدرس ویدیوی آپارات را وارد کنید:</label>
              <button
                type="button"
                onClick={() => loadSample('aparat')}
                className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                id="btn-sample-aparat"
              >
                <Sparkles className="h-3 w-3" />
                <span>بارگذاری لینک نمونه</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aparatUrl}
                onChange={(e) => {
                  setAparatUrl(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="https://www.aparat.com/v/..."
                className="flex-1 px-3.5 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-left dir-ltr"
                id="aparat-url-input"
                required
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-rose-500/20 shrink-0"
                id="aparat-play-btn"
              >
                پخش ویدیو
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              پشتیبانی از آدرس‌های ویدیوی آپارات همراه با آی‌فریم رسمی و بالاترین کیفیت ممکن
            </p>
          </form>
        )}

        {/* 3. Direct URL Form */}
        {activeTab === 'direct' && (
          <form onSubmit={handleDirectSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">لینک مستقیم فایل ویدیو (MP4 / WebM / OGG):</label>
              <button
                type="button"
                onClick={() => loadSample('direct')}
                className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                id="btn-sample-direct"
              >
                <Sparkles className="h-3 w-3" />
                <span>بارگذاری لینک نمونه</span>
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={directUrl}
                onChange={(e) => {
                  setDirectUrl(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="https://example.com/video.mp4"
                className="flex-1 px-3.5 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-rose-500 transition-colors text-left dir-ltr"
                id="direct-url-input"
                required
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-rose-500/20 shrink-0"
                id="direct-play-btn"
              >
                پخش ویدیو
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              لینک مستقیم به فایل ویدیویی روی اینترنت با کنترل‌های پیشرفته پخش، تنظیم سرعت و زیرنویس
            </p>
          </form>
        )}

        {/* 4. Local Video File Picker & Drag & Drop */}
        {activeTab === 'local' && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all select-none ${
              isDragOver
                ? 'border-rose-500 bg-rose-500/10 scale-[1.01]'
                : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700 hover:bg-zinc-900/50'
            }`}
            id="drag-and-drop-container"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*,.mp4,.webm,.mov,.mkv,.ogg"
              className="hidden"
            />
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl mb-2.5 border border-rose-500/20">
              <Upload className="h-6 w-6 animate-pulse" />
            </div>
            <h4 className="text-xs font-bold text-zinc-200">ویدیو را اینجا بکشید یا برای انتخاب کلیک کنید</h4>
            <p className="text-[11px] text-zinc-500 mt-1.5 text-center leading-relaxed max-w-sm">
              پشتیبانی از انواع فرمت‌های ویدیویی (MP4، WebM، MOV، MKV) بدون هیچ‌گونه محدودیت حجمی فایل
              <br />
              <span className="text-zinc-400 font-medium">(پخش کاملاً درون مرورگر بدون آپلود روی سرور جهت حفظ ۱۰۰٪ حریم خصوصی)</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
