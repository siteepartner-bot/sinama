import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Link2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Globe,
  Laptop,
  Play,
  Upload,
  Youtube,
  Lock,
  Zap,
  Subtitles,
  Volume2,
  Maximize
} from 'lucide-react';
import {
  parseDirectVideoUrl,
  parseYouTubeUrl,
  parseAparatUrl,
} from '../utils/mediaParsers';
import { realTimeClient } from '../services/realtimeClient';

type TabType = 'direct' | 'local' | 'youtube' | 'aparat';

interface MediaSourcePanelProps {
  currentSourceType?: string;
  currentUrl?: string;
  canControlVideo?: boolean;
  isHost?: boolean;
  allowAnyoneControl?: boolean;
  onSourceChange?: (type: 'youtube' | 'aparat' | 'direct' | 'local', url: string, title?: string) => void;
  onLocalFileSelected?: (file: File) => void;
}

export function MediaSourcePanel({
  currentSourceType = 'direct',
  currentUrl = '',
  canControlVideo = true,
  isHost = false,
  allowAnyoneControl = true,
  onSourceChange,
  onLocalFileSelected,
}: MediaSourcePanelProps) {
  // Default to direct player as requested by user
  const [activeTab, setActiveTab] = useState<TabType>('direct');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [aparatUrl, setAparatUrl] = useState('');
  const [directUrl, setDirectUrl] = useState(
    currentSourceType === 'direct' ? currentUrl : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showSuccessFeedback = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => {
      setSuccessMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const changeVideoSource = (
    type: 'youtube' | 'aparat' | 'direct' | 'local',
    url: string,
    title?: string
  ) => {
    if (!canControlVideo) {
      setErrorMsg('کنترل و تغییر ویدیوی اتاق توسط مالک محدود شده است.');
      return;
    }

    if (onSourceChange) {
      onSourceChange(type, url, title);
    } else {
      realTimeClient.emitSourceChange({
        type,
        url,
        title: title || 'ویدیوی جدید',
      });
    }
  };

  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!canControlVideo) {
      setErrorMsg('شما اجازه تغییر ویدیوی اتاق را ندارید. دسترسی توسط مالک اتاق قفل شده است.');
      return;
    }

    const parsed = parseYouTubeUrl(youtubeUrl);
    if (!parsed || !parsed.isValid || !parsed.videoId) {
      setErrorMsg('لینک یوتیوب وارد شده معتبر نیست. لطفاً یک لینک معتبر وارد کنید.');
      return;
    }

    changeVideoSource('youtube', youtubeUrl, `یوتیوب: ${parsed.videoId}`);
    showSuccessFeedback('ویدیوی یوتیوب با موفقیت بارگذاری شد و با تمام اعضا همگام شد.');
  };

  const handleAparatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!canControlVideo) {
      setErrorMsg('شما اجازه تغییر ویدیوی اتاق را ندارید. دسترسی توسط مالک اتاق قفل شده است.');
      return;
    }

    const parsed = parseAparatUrl(aparatUrl);
    if (!parsed || !parsed.isValid || !parsed.videoHash) {
      setErrorMsg('لینک آپارات وارد شده معتبر نیست. لطفاً یک لینک معتبر وارد کنید.');
      return;
    }

    changeVideoSource('aparat', aparatUrl, `آپارات: ${parsed.videoHash}`);
    showSuccessFeedback('ویدیوی آپارات با موفقیت بارگذاری شد و با تمام اعضا همگام شد.');
  };

  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!canControlVideo) {
      setErrorMsg('شما اجازه تغییر ویدیوی اتاق را ندارید. دسترسی توسط مالک اتاق قفل شده است.');
      return;
    }

    const parsed = parseDirectVideoUrl(directUrl);
    if (!parsed) {
      setErrorMsg('لینک مستقیم ویدیو معتبر نیست. آدرس باید با http:// یا https:// شروع شود.');
      return;
    }

    changeVideoSource('direct', parsed.url, parsed.title);
    showSuccessFeedback('ویدیوی پلیر اختصاصی با موفقیت در اتاق بارگذاری شد.');
  };

  // Local File Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadLocalFile(file);
    }
  };

  const loadLocalFile = (file: File) => {
    setErrorMsg(null);

    if (!canControlVideo) {
      setErrorMsg('کنترل و تغییر ویدیوی اتاق توسط مالک محدود شده است.');
      return;
    }

    if (onLocalFileSelected) {
      onLocalFileSelected(file);
    } else {
      const blobUrl = URL.createObjectURL(file);
      changeVideoSource('local', blobUrl, file.name);
    }
    showSuccessFeedback(`فایل محلی «${file.name}» در پلیر اختصاصی بارگذاری شد.`);
  };

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

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    setErrorMsg(null);
  };

  // Sample curated library for custom player
  const sampleVideos = [
    {
      title: 'انیمیشن سینمایی Big Buck Bunny',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      desc: 'کیفیت HD همراه با زیرنویس نمونه فارسی و انگلیسی',
    },
    {
      title: 'فیلم علمی-تخیلی Tears of Steel',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      desc: 'جلوه‌های ویژه و صدای فراگیر استریو',
    },
    {
      title: 'انیمیشن فانتزی Sintel Trailer',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      desc: 'طراحی بصری چشم‌نواز و موسیقی جذاب',
    },
    {
      title: 'مستند حیات‌وحsh طبیعت و پرواز',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      desc: 'ویدیو با وضوح بالا و زمان بارگذاری فوق‌سریع',
    },
  ];

  const tabs = [
    { id: 'direct', label: 'پلیر اختصاصی (لینک مستقیم)', icon: Zap, color: 'text-rose-500', isRecommended: true },
    { id: 'local', label: 'فایل کامپیوتر (لوکال)', icon: Laptop, color: 'text-amber-400' },
    { id: 'youtube', label: 'یوتیوب (YouTube)', icon: Youtube, color: 'text-red-500' },
    { id: 'aparat', label: 'آپارات (Aparat)', icon: Play, color: 'text-orange-400' },
  ];

  return (
    <div className="bg-[#12141c] border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-col shadow-lg" id="video-source-panel">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Link2 className="h-4.5 w-4.5 text-rose-500" />
          <span>انتخاب منبع پخش ویدیو</span>
        </h3>
        <span className="text-[11px] text-zinc-400 font-mono bg-zinc-800/60 px-2 py-0.5 rounded-lg">
          پلیر اختصاصی واچ‌پارتی
        </span>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-zinc-800/80 pb-2 mb-3.5 overflow-x-auto gap-1.5 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id as TabType)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap relative ${
                isActive
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850 border border-transparent'
              }`}
              id={`tab-source-${tab.id}`}
            >
              <Icon className={`h-4 w-4 ${tab.color}`} />
              <span>{tab.label}</span>
              {tab.isRecommended && (
                <span className="text-[9px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded-md border border-rose-500/30">
                  پیشنهادی
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Video Control Permission Notice */}
      {!canControlVideo && (
        <div className="flex items-center gap-2.5 p-3 mb-3.5 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs rounded-xl" id="panel-locked-notice">
          <Lock className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="leading-relaxed">
            کنترل و تغییر ویدیوی اتاق در حال حاضر توسط مالک محدود شده است. برای تغییر ویدیو باید مالک دسترسی را باز کند.
          </span>
        </div>
      )}

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
        {/* 1. Dedicated Player (Direct Stream & URL) */}
        {activeTab === 'direct' && (
          <div className="space-y-3.5">
            {/* Features Highlights Pill Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 bg-black/40 border border-zinc-800/80 rounded-xl text-[11px] text-zinc-300">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span>همگام‌سازی فریم‌به‌فریم</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Subtitles className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>پشتیبانی از زیرنویس SRT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>تقویت صدا تا ۲۰۰٪</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Maximize className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span>کادربندی سینمایی ۲۱:۹</span>
              </div>
            </div>

            <form onSubmit={handleDirectSubmit} className="space-y-3">
              <label className="text-xs text-zinc-400 font-medium block">
                لینک مستقیم فایل ویدیو یا استریم (MP4 / WebM / MKV):
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={directUrl}
                  onChange={(e) => {
                    setDirectUrl(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="https://domain.com/video.mp4"
                  className="flex-1 px-3.5 py-2.5 bg-zinc-900/80 border border-zinc-700/80 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors text-left dir-ltr"
                  id="direct-url-input"
                  required
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-rose-500/20 shrink-0"
                  id="direct-play-btn"
                >
                  پخش در پلیر اختصاصی
                </button>
              </div>
            </form>

            {/* Quick Sample Library */}
            <div className="pt-2 border-t border-zinc-800/80">
              <div className="text-[11px] font-semibold text-zinc-400 mb-2 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-rose-400" />
                <span>ویدیوهای نمونه آماده تماشای گروهی با کیفیت عالی:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sampleVideos.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!canControlVideo) {
                        setErrorMsg('کنترل و تغییر ویدیوی اتاق توسط مالک محدود شده است.');
                        return;
                      }
                      setDirectUrl(sample.url);
                      changeVideoSource('direct', sample.url, sample.title);
                      showSuccessFeedback(`«${sample.title}» در پلیر بارگذاری شد.`);
                    }}
                    className="p-2.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/80 border border-zinc-800 hover:border-rose-500/30 text-right transition-all cursor-pointer flex flex-col group active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-zinc-200 group-hover:text-rose-300 transition-colors">
                        {sample.title}
                      </span>
                      <Play className="h-3 w-3 text-zinc-500 group-hover:text-rose-400 transition-colors" />
                    </div>
                    <span className="text-[10px] text-zinc-400 mt-1">{sample.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Local Video File Picker & Drag & Drop */}
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
              accept="video/*,.mp4,.mkv,.webm,.mov,.ogg,.avi,.m4v,video/x-matroska,video/mkv,video/mp4,video/webm"
              className="hidden"
            />
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl mb-2.5 border border-rose-500/20">
              <Upload className="h-6 w-6 animate-pulse" />
            </div>
            <h4 className="text-xs font-bold text-zinc-200">ویدیو را اینجا بکشید یا برای انتخاب کلیک کنید</h4>
            <p className="text-[11px] text-zinc-500 mt-1.5 text-center leading-relaxed max-w-sm">
              پشتیبانی کامل از فرمت‌های <span className="text-rose-400 font-semibold">MKV</span>، MP4، WebM، MOV و AVI بدون محدودیت حجم فایل
              <br />
              <span className="text-zinc-400 font-medium">(پخش کاملاً روان درون پلیر اختصاصی بدون آپلود روی سرور جهت حفظ حریم خصوصی)</span>
            </p>
          </div>
        )}

        {/* 3. YouTube Form */}
        {activeTab === 'youtube' && (
          <form onSubmit={handleYoutubeSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">آدرس ویدیوی یوتیوب را وارد کنید:</label>
              <button
                type="button"
                onClick={() => {
                  if (!canControlVideo) {
                    setErrorMsg('کنترل و تغییر ویدیوی اتاق توسط مالک محدود شده است.');
                    return;
                  }
                  const sample = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
                  setYoutubeUrl(sample);
                  changeVideoSource('youtube', sample, 'Rick Astley - Never Gonna Give You Up (Official Music Video)');
                  showSuccessFeedback('ویدیوی نمونه یوتیوب بارگذاری شد.');
                }}
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
              نکته: به دلیل محدودیت‌های امنیتی آی‌فریم یوتیوب در مرورگرها، پلیر اختصاصی (تب اول) سینک دقیق‌تری ارائه می‌دهد.
            </p>
          </form>
        )}

        {/* 4. Aparat Form */}
        {activeTab === 'aparat' && (
          <form onSubmit={handleAparatSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 font-medium">آدرس ویدیوی آپارات را وارد کنید:</label>
              <button
                type="button"
                onClick={() => {
                  if (!canControlVideo) {
                    setErrorMsg('کنترل و تغییر ویدیوی اتاق توسط مالک محدود شده است.');
                    return;
                  }
                  const sample = 'https://www.aparat.com/v/vM82f';
                  setAparatUrl(sample);
                  changeVideoSource('aparat', sample, 'ویدیوی نمونه آپارات');
                  showSuccessFeedback('ویدیوی نمونه آپارات بارگذاری شد.');
                }}
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
              پشتیبانی از آدرس‌های ویدیوی آپارات همراه با آی‌فریم رسمی
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
