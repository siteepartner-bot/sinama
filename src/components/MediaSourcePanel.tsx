import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Youtube,
  Play,
  Globe,
  Upload,
  Link2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Users,
  Loader2,
  X,
  Film,
  Zap,
  Clock,
  Gauge,
  HardDrive
} from 'lucide-react';
import { useRoom } from '../hooks/useRoom';
import { parseYouTubeUrl, parseAparatUrl, isValidDirectVideoUrl } from '../utils/mediaParsers';

type TabType = 'upload' | 'syncplay' | 'direct' | 'youtube' | 'aparat';

interface UploadProgressState {
  isUploading: boolean;
  fileName: string;
  fileSizeFormatted: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  speedFormatted: string;
  etaFormatted: string;
  totalChunks: number;
  completedChunks: number;
  activeThreads: number;
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk
const CONCURRENCY = 4; // 4 simultaneous upload streams for maximum network throughput

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
    speedFormatted: '',
    etaFormatted: '',
    totalChunks: 0,
    completedChunks: 0,
    activeThreads: 0
  });

  // Local Syncplay state
  const [syncplayFileName, setSyncplayFileName] = useState<string | null>(null);

  // Error and feedback states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncplayFileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
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

  const formatETA = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '--';
    if (seconds < 60) return `${Math.round(seconds)} ثانیه`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins} دقیقه و ${secs} ثانیه`;
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

  // 4. Turbo Multi-Threaded Chunk Upload
  const startTurboUpload = async (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const isVideoType = file.type.startsWith('video/') || file.type === 'video/x-matroska' || file.type === 'video/mkv';
    const hasVideoExt = /\.(mp4|mkv|webm|mov|ogg|avi|m4v|3gp|ts)$/i.test(file.name);

    if (!isVideoType && !hasVideoExt) {
      setErrorMsg('فرمت فایل انتخابی ویدیو نیست. لطفاً یک فایل ویدیویی معتبر (MP4, MKV, WebM, MOV, AVI) انتخاب کنید.');
      return;
    }

    const totalSize = file.size;
    const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    uploadStartTimeRef.current = Date.now();
    setUploadState({
      isUploading: true,
      fileName: file.name,
      fileSizeFormatted: formatBytes(totalSize),
      progress: 0,
      uploadedBytes: 0,
      totalBytes: totalSize,
      speedFormatted: 'در حال آماده‌سازی...',
      etaFormatted: 'محاسبه زمان...',
      totalChunks,
      completedChunks: 0,
      activeThreads: Math.min(CONCURRENCY, totalChunks)
    });

    try {
      // Step A: Initialize Chunked Upload on Server
      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: totalSize,
          totalChunks,
          chunkSize: CHUNK_SIZE
        }),
        signal: abortController.signal
      });

      if (!initRes.ok) {
        const errJson = await initRes.json().catch(() => ({}));
        throw new Error(errJson.error || `خطا در شروع آپلود (${initRes.status})`);
      }

      const { uploadId } = await initRes.json();

      // Step B: Parallel Worker Pool Upload
      let nextChunkIndex = 0;
      let completedCount = 0;
      const chunkBytesLoaded = new Array(totalChunks).fill(0);

      const updateProgress = () => {
        const totalUploaded = chunkBytesLoaded.reduce((acc, curr) => acc + curr, 0);
        const percent = Math.min(99, Math.round((totalUploaded / totalSize) * 100));
        const elapsed = (Date.now() - uploadStartTimeRef.current) / 1000;
        const bytesPerSec = elapsed > 0 ? totalUploaded / elapsed : 0;
        const remainingBytes = Math.max(0, totalSize - totalUploaded);
        const etaSeconds = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;

        setUploadState((prev) => ({
          ...prev,
          progress: percent,
          uploadedBytes: totalUploaded,
          completedChunks: completedCount,
          speedFormatted: formatBytes(bytesPerSec) + '/ثانیه (۴ کانال موازی)',
          etaFormatted: formatETA(etaSeconds)
        }));
      };

      const uploadSingleChunk = async (index: number, retries = 3): Promise<void> => {
        const start = index * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkBlob = file.slice(start, end);
        const thisChunkSize = end - start;

        try {
          const res = await fetch(`/api/upload/chunk?uploadId=${encodeURIComponent(uploadId)}&chunkIndex=${index}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Upload-Id': uploadId,
              'X-Chunk-Index': index.toString()
            },
            body: chunkBlob,
            signal: abortController.signal
          });

          if (!res.ok) {
            throw new Error(`خطا در ارسال تکه ${index}`);
          }

          chunkBytesLoaded[index] = thisChunkSize;
          completedCount++;
          updateProgress();
        } catch (err) {
          if (abortController.signal.aborted) return;
          if (retries > 0) {
            await new Promise((r) => setTimeout(r, 600));
            return uploadSingleChunk(index, retries - 1);
          }
          throw err;
        }
      };

      // Worker Thread Function
      const worker = async () => {
        while (nextChunkIndex < totalChunks) {
          if (abortController.signal.aborted) break;
          const currentIndex = nextChunkIndex++;
          await uploadSingleChunk(currentIndex);
        }
      };

      // Launch Concurrent Workers
      const activeConcurrency = Math.min(CONCURRENCY, totalChunks);
      const workerPromises: Promise<void>[] = [];
      for (let i = 0; i < activeConcurrency; i++) {
        workerPromises.push(worker());
      }

      await Promise.all(workerPromises);

      if (abortController.signal.aborted) return;

      // Step C: Complete & Merge on Server
      setUploadState((prev) => ({
        ...prev,
        progress: 99,
        speedFormatted: 'در حال ذخیره‌سازی نهایی روی سرور...',
        etaFormatted: 'چند لحظه...'
      }));

      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          fileName: file.name,
          totalChunks
        }),
        signal: abortController.signal
      });

      if (!completeRes.ok) {
        const errJson = await completeRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'خطا در تجمیع نهایی فایل روی سرور');
      }

      const result = await completeRes.json();
      if (result.success && result.url) {
        setUploadState((prev) => ({ ...prev, progress: 100, isUploading: false }));
        // Broadcast and play from high-speed HTTP 206 streaming URL
        changeVideoSource('direct', result.url, result.fileName || file.name);
        showSuccessFeedback(`فایل «${file.name}» با بالاترین سرعت آپلود شد و برای هر دو طرف پخش می‌شود.`);
      } else {
        throw new Error(result.error || 'خطا در ثبت ویدیوی آپلود شده');
      }
    } catch (err: any) {
      if (abortController.signal.aborted) {
        setErrorMsg('آپلود ویدیو توسط شما لغو شد.');
      } else {
        console.error('Turbo Upload Failed:', err);
        setErrorMsg(err.message || 'خطا در آپلود پرسرعت ویدیو. لطفاً اتصال اینترنت را بررسی کنید.');
      }
      setUploadState((prev) => ({ ...prev, isUploading: false }));
    } finally {
      abortControllerRef.current = null;
    }
  };

  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploadState({
      isUploading: false,
      fileName: '',
      fileSizeFormatted: '',
      progress: 0,
      uploadedBytes: 0,
      totalBytes: 0,
      speedFormatted: '',
      etaFormatted: '',
      totalChunks: 0,
      completedChunks: 0,
      activeThreads: 0
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      startTurboUpload(file);
    }
  };

  // Syncplay mode handler (Instant 0-wait local playback)
  const handleSyncplayFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSyncplayFileName(file.name);
      const objectUrl = URL.createObjectURL(file);
      changeVideoSource('direct', objectUrl, `[Syncplay] ${file.name}`);
      showSuccessFeedback(`فایل محلی «${file.name}» آماده شد! اگر طرف مقابل هم همین فایل را انتخاب کند، همزمان با صفر مگابایت مصرف حجم پخش می‌شود.`);
    }
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
      startTurboUpload(file);
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
    { id: 'upload', label: 'آپلود توربو چندکاناله (سرعت فوق‌العاده)', icon: Zap, color: 'text-amber-400' },
    { id: 'syncplay', label: 'پخش همگام محلی (بدون آپلود و معطلی)', icon: HardDrive, color: 'text-emerald-400' },
    { id: 'direct', label: 'لینک مستقیم وب', icon: Globe, color: 'text-blue-400' },
    { id: 'youtube', label: 'یوتیوب (YouTube)', icon: Youtube, color: 'text-red-500' },
    { id: 'aparat', label: 'آپارات (Aparat)', icon: Play, color: 'text-orange-400' },
  ];

  return (
    <div className="bg-[#12141c] border border-zinc-800/80 rounded-2xl p-4 md:p-5 flex flex-col h-full shadow-lg" id="video-source-panel">
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Link2 className="h-4.5 w-4.5 text-rose-500" />
          <span>انتخاب و پخش ویدیو در اتاق</span>
        </h3>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[11px] font-medium">
          <Zap className="h-3 w-3 fill-amber-400" />
          <span>موتور انتقال پرسرعت Turbo Multi-Thread</span>
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
        {/* 1. Turbo Multi-Threaded Chunk Upload */}
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
                    ? 'border-amber-500 bg-amber-500/15 scale-[1.01]'
                    : 'border-zinc-800 bg-zinc-900/40 hover:border-amber-500/40 hover:bg-zinc-900/60'
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
                <div className="p-3.5 bg-amber-500/15 text-amber-400 rounded-2xl mb-3 border border-amber-500/30">
                  <Zap className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <span>آپلود توربو چندکاناله (Multi-Threaded)</span>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[10px]">۴ کانال موازی</span>
                </h4>
                <p className="text-xs text-zinc-400 mt-1.5 text-center leading-relaxed max-w-md">
                  ویدیو به قطعات ۴ مگابایتی تقسیم شده و با <strong className="text-amber-300">۴ اتصال موازی همزمان</strong> با حداکثر پهنای باند اینترنت شما روی سرور ذخیره و برای هر دو طرف پخش می‌شود.
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
                    <div className="p-2.5 bg-amber-500/15 text-amber-400 rounded-xl border border-amber-500/30 shrink-0">
                      <Film className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-zinc-100 truncate">{uploadState.fileName}</h4>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        حجم: {uploadState.fileSizeFormatted} • قطعات: {uploadState.completedChunks} از {uploadState.totalChunks}
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

                {/* Progress bar and metrics */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-zinc-300 flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                      <span>{uploadState.speedFormatted}</span>
                    </span>
                    <span className="text-amber-400 font-bold font-mono text-sm">{uploadState.progress}٪</span>
                  </div>

                  <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                    <motion.div
                      className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${uploadState.progress}%` }}
                      transition={{ ease: 'easeOut', duration: 0.15 }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-zinc-500" />
                      <span>زمان باقیمانده: <strong className="text-zinc-200">{uploadState.etaFormatted}</strong></span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Gauge className="h-3 w-3 text-amber-400" />
                      <span>۴ رشته موازی همزمان فعال</span>
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                  فایل با بالاترین شتاب چندکاناله در حال بارگذاری است. به محض اتمام، پخش همزمان خودکار شروع می‌شود.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 2. Syncplay Local Mode (0 seconds wait, 0 bandwidth consumed) */}
        {activeTab === 'syncplay' && (
          <div className="p-5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/15 text-emerald-400 rounded-xl border border-emerald-500/30">
                <HardDrive className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-100">پخش آنی فایل محلی (Syncplay Mode)</h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  صفر ثانیه زمان انتظار • صفر مگابایت مصرف حجم آپلود
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs rounded-xl leading-relaxed">
              💡 <strong>روش کار:</strong> اگر هر دو نفر شما فایل ویدیویی مشابه را از قبل دانلود کرده‌اید (یا فایل روی کامپیوتر هر دو موجود است)، کافیست هر دو نفر آن را انتخاب کنید. پلیر فوراً بدون نیاز به آپلود، پخش و زمان را بین هر دو نفر با دقت میلی‌ثانیه سینک می‌کند!
            </div>

            <input
              type="file"
              ref={syncplayFileInputRef}
              onChange={handleSyncplayFile}
              accept="video/*,.mp4,.mkv,.webm,.mov,.ogg,.avi"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => syncplayFileInputRef.current?.click()}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20"
            >
              <Upload className="h-4 w-4" />
              <span>{syncplayFileName ? `تغییر فایل انتخابی (${syncplayFileName})` : 'انتخاب فایل از سیستم و شروع پخش آنی'}</span>
            </button>
          </div>
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

        {/* 4. YouTube Form */}
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

        {/* 5. Aparat Form */}
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
