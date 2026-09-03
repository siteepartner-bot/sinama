import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Youtube, Play, Globe, Upload, Link2, Sparkles, AlertCircle, CheckCircle2, Users, Loader2, X, Film, Check } from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { parseYouTubeUrl, parseAparatUrl, isValidDirectVideoUrl } from '../utils/mediaParsers';

type TabType = 'upload' | 'youtube' | 'aparat' | 'direct';

interface UploadProgressState {
  isUploading: boolean;
  fileName: string;
  fileSizeFormatted: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  speedFormatted: string;
}

export function MediaSourcePanel() {
  const { changeVideoSource } = useRoom();
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  
  // URL Input states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [aparatUrl, setAparatUrl] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  
  // Upload states
  const [uploadState, setUploadState] = useState<UploadProgressState>({
    isUploading: false,
    fileName: '',
    fileSizeFormatted: '',
    progress: 0,
    uploadedBytes: 0,
    totalBytes: 0,
    speedFormatted: ''
  });
  
  // Error and feedback states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const uploadStartTimeRef = useRef<number>(0);

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
    }, 4500);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 بایت';
    const k = 1024;
    const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
    showSuccessFeedback('ویدیوی یوتیوب با موفقیت برای تمام اعضای اتاق بارگذاری شد.');
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
    showSuccessFeedback('ویدیوی آپارات با موفقیت برای تمام اعضای اتاق بارگذاری شد.');
  };

  // 3. Direct URL Submit
  const handleDirectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isValidDirectVideoUrl(directUrl)) {
      setErrorMsg('لینک مستقیم وارد شده نامعتبر است. آدرس باید با http:// یا https:// شروع شود.');
      return;
    }

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
    showSuccessFeedback('لینک مستقیم ویدیو با موفقیت برای تمام اعضای اتاق بارگذاری شد.');
  };

  // 4. Video File Upload to Server
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startUpload(file);
    }
  };

  const cancelUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setUploadState({
      isUploading: false,
      fileName: '',
      fileSizeFormatted: '',
      progress: 0,
      uploadedBytes: 0,
      totalBytes: 0,
      speedFormatted: ''
    });
    setErrorMsg('آپلود ویدیو متوقف شد.');
  };

  const startUpload = (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const isVideoType = file.type.startsWith('video/') || file.type === 'video/x-matroska' || file.type === 'video/mkv';
    const hasVideoExt = /\.(mp4|mkv|webm|mov|ogg|avi|m4v|3gp|ts)$/i.test(file.name);

    if (!isVideoType && !hasVideoExt) {
      setErrorMsg('فرمت فایل انتخابی ویدیو نیست. لطفاً یک فایل ویدیویی معتبر (MP4, MKV, WebM, MOV, AVI) انتخاب کنید.');
      return;
    }

    uploadStartTimeRef.current = Date.now();
    setUploadState({
      isUploading: true,
      fileName: file.name,
      fileSizeFormatted: formatBytes(file.size),
      progress: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
      speedFormatted: '0 مگابایت/ثانیه'
    });

    const formData = new FormData();
    formData.append('video', file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const elapsedTime = (Date.now() - uploadStartTimeRef.current) / 1000;
        const bytesPerSec = elapsedTime > 0 ? event.loaded / elapsedTime : 0;
        const speedStr = formatBytes(bytesPerSec) + '/ثانیه';

        setUploadState({
          isUploading: true,
          fileName: file.name,
          fileSizeFormatted: formatBytes(event.total),
          progress: Math.min(99, percent),
          uploadedBytes: event.loaded,
          totalBytes: event.total,
          speedFormatted: speedStr
        });
      }
    };

    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.url) {
            setUploadState((prev) => ({ ...prev, progress: 100, isUploading: false }));
            // Set video source to direct server URL so BOTH / ALL members play from the server!
            changeVideoSource('direct', res.url, res.fileName || file.name);
            showSuccessFeedback(`فایل «${file.name}» با موفقیت آپلود شد و برای تمامی اعضای اتاق پخش می‌شود.`);
          } else {
            setErrorMsg(res.error || 'خطا در پردازش ویدیو در سرور.');
            setUploadState((prev) => ({ ...prev, isUploading: false }));
          }
        } catch {
          setErrorMsg('خطا در دریافت پاسخ سرور.');
          setUploadState((prev) => ({ ...prev, isUploading: false }));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setErrorMsg(res.error || `خطای سرور (${xhr.status})`);
        } catch {
          setErrorMsg(`خطا در آپلود ویدیو (کد وضعیت: ${xhr.status})`);
        }
        setUploadState((prev) => ({ ...prev, isUploading: false }));
      }
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      setErrorMsg('خطای شبکه در اتصال به سرور جهت آپلود ویدیو.');
      setUploadState((prev) => ({ ...prev, isUploading: false }));
    };

    xhr.open('POST', '/api/upload', true);
    xhr.send(formData);
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
      startUpload(file);
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
      changeVideoSource('direct', sample, 'Big Buck Bunny (ویدیوی نمونه مستقیم)');
      showSuccessFeedback('ویدیوی نمونه مستقیم بارگذاری شد.');
    }
  };

  const tabs = [
    { id: 'upload', label: 'آپلود از کامپیوتر (پخش دوطرفه)', icon: Upload, color: 'text-rose-400' },
    { id: 'direct', label: 'لینک مستقیم ویدیو', icon: Globe, color: 'text-blue-400' },
    { id: 'youtube', label: 'یوتیوب (YouTube)', icon: Youtube, color: 'text-red-500' },
    { id: 'aparat', label: 'آپارات (Aparat)', icon: Play, color: 'text-orange-400' },
  ];

  return (
    <div className="bg-[#12141c] border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-col h-full shadow-lg" id="video-source-panel">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Link2 className="h-4.5 w-4.5 text-rose-500" />
          <span>انتخاب و آپلود منبع ویدیو</span>
        </h3>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[11px] font-medium">
          <Users className="h-3 w-3" />
          <span>پخش و همگام‌سازی دوطرفه</span>
        </div>
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
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
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

      {/* Video Control Permission Notice */}
      <div className="flex items-center gap-2.5 p-2.5 mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl" id="panel-allowed-notice">
        <Users className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="leading-relaxed">
          با آپلود یا انتخاب هر ویدیو، فایل روی سرور ذخیره شده و همزمان با کنترل کامل (پخش، توقف، عقب/جلو و سرعت) برای هر دو طرف پخش می‌شود.
        </span>
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
        {/* 1. Upload from Computer (Saved on server & streamed for all users) */}
        {activeTab === 'upload' && (
          <div className="space-y-3">
            {!uploadState.isUploading ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all select-none ${
                  isDragOver
                    ? 'border-rose-500 bg-rose-500/15 scale-[1.01]'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-rose-500/40 hover:bg-zinc-900/60'
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
                <div className="p-3.5 bg-rose-500/15 text-rose-400 rounded-2xl mb-3 border border-rose-500/30">
                  <Upload className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-zinc-100">فایل ویدیو را انتخاب یا اینجا بکشید</h4>
                <p className="text-xs text-zinc-400 mt-1.5 text-center leading-relaxed max-w-md">
                  ویدیو در سرور ذخیره می‌شود و بلافاصله برای <span className="text-rose-400 font-semibold">هر دو طرف به صورت مشترک</span> با کیفیت اصلی، جابجایی زمان و همگام‌سازی زنده پخش خواهد شد.
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <span className="px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-[10px] text-zinc-300 font-mono">MP4</span>
                  <span className="px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-[10px] text-zinc-300 font-mono">MKV</span>
                  <span className="px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-[10px] text-zinc-300 font-mono">WebM</span>
                  <span className="px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-[10px] text-zinc-300 font-mono">MOV</span>
                  <span className="px-2 py-0.5 bg-zinc-800/80 border border-zinc-700/60 rounded-md text-[10px] text-zinc-300 font-mono">AVI</span>
                </div>
              </div>
            ) : (
              /* Live Upload Progress Screen */
              <div className="p-5 bg-zinc-900/80 border border-zinc-800 rounded-2xl flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-rose-500/15 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                      <Film className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-100 truncate">{uploadState.fileName}</h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        حجم: {uploadState.fileSizeFormatted} • سرعت: {uploadState.speedFormatted}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={cancelUpload}
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                    title="لغو آپلود"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-zinc-400 flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-500" />
                      <span>در حال آپلود و آماده‌سازی برای پخش همزمان...</span>
                    </span>
                    <span className="text-rose-400 font-bold font-mono">{uploadState.progress}٪</span>
                  </div>
                  <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                    <motion.div
                      className="h-full bg-gradient-to-r from-rose-600 to-pink-500 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${uploadState.progress}%` }}
                      transition={{ ease: 'easeOut', duration: 0.2 }}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                  لطفاً تا پایان آپلود صفحه را نبندید. پس از اتمام، ویدیو به طور خودکار در پلیر هر دو طرف لود می‌شود.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 2. Direct URL Form */}
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

        {/* 3. YouTube Form */}
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

        {/* 4. Aparat Form */}
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
      </div>
    </div>
  );
}
