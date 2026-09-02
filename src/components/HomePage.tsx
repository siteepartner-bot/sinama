import { motion } from 'motion/react';
import { Film, Video, Mic, Monitor, Laptop, Youtube, Play, ArrowRight, UserPlus } from 'lucide-react';
import { ViewType } from '../types';

interface HomePageProps {
  onNavigate: (view: ViewType) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const features = [
    {
      icon: Film,
      title: 'واچ پارتی (Watch Party)',
      desc: 'تماشای همزمان فیلم و سریال به صورت کاملاً هماهنگ با دوستان.',
      color: 'from-rose-500/10 to-rose-500/5 text-rose-400 border-rose-500/20',
    },
    {
      icon: Video,
      title: 'تماس تصویری (Video Call)',
      desc: 'گفتگوی ویدیویی با کیفیت بالا در حین تماشای ویدیو.',
      color: 'from-blue-500/10 to-blue-500/5 text-blue-400 border-blue-500/20',
    },
    {
      icon: Mic,
      title: 'تماس صوتی (Voice Call)',
      desc: 'ارتباط صوتی با تاخیر کم و صدای شفاف برای هم‌صحبتی واقعی.',
      color: 'from-emerald-500/10 to-emerald-500/5 text-emerald-400 border-emerald-500/20',
    },
    {
      icon: Monitor,
      title: 'اشتراک‌گذاری صفحه (Screen Share)',
      desc: 'نمایش مرورگر یا هر برنامه‌ای از کامپیوتر خودتان برای بقیه اعضا.',
      color: 'from-purple-500/10 to-purple-500/5 text-purple-400 border-purple-500/20',
    },
    {
      icon: Laptop,
      title: 'پخش ویدیو از کامپیوتر',
      desc: 'فایل ویدیویی روی هارد خود را انتخاب و با سرعت بالا برای بقیه استریم کنید.',
      color: 'from-amber-500/10 to-amber-500/5 text-amber-400 border-amber-500/20',
    },
    {
      icon: Youtube,
      title: 'پخش مستقیم یوتیوب',
      desc: 'کافی است لینک هر ویدیویی از یوتیوب را قرار دهید تا همزمان شروع به پخش شود.',
      color: 'from-red-500/10 to-red-500/5 text-red-500 border-red-500/20',
    },
    {
      icon: Play,
      title: 'پخش مستقیم آپارات',
      desc: 'پشتیبانی کامل از ویدیوهای آپارات برای دسترسی آسان به محتوای فارسی.',
      color: 'from-orange-500/10 to-orange-500/5 text-orange-400 border-orange-500/20',
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[90vh] px-4 py-12 max-w-6xl mx-auto" id="home-page-container">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-2xl mb-12"
      >
        <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm font-medium mb-6 animate-pulse">
          <Film className="h-4 w-4" />
          <span>نسخه دمو و اسکلت اصلی پلتفرم</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
          روم‌ی <span className="text-rose-500">Roomy</span>
        </h1>
        
        <p className="text-lg md:text-xl text-zinc-400 leading-relaxed font-normal">
          با دوستانت فیلم ببین، صحبت کن و لحظه‌ها رو با هم تجربه کن.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('create-room')}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-rose-500/25 transition-all cursor-pointer"
            id="btn-create-room"
          >
            <Film className="h-5 w-5" />
            <span>ساخت اتاق جدید</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('join-room')}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold text-lg border border-zinc-700 transition-all cursor-pointer"
            id="btn-join-room"
          >
            <UserPlus className="h-5 w-5" />
            <span>ورود به اتاق دوستان</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-zinc-800/80 my-16" />

      {/* Features Grid */}
      <div className="w-full">
        <h2 className="text-2xl font-bold text-zinc-100 mb-8 text-center sm:text-right">
          قابلیت‌ها و امکانات Roomy
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className={`flex flex-col p-6 rounded-2xl border bg-gradient-to-br ${feature.color} backdrop-blur-sm transition-all hover:border-opacity-40 hover:scale-[1.01]`}
              >
                <div className="p-3 bg-zinc-900/50 rounded-xl w-fit mb-4 border border-zinc-800">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-zinc-200 mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed font-light">{feature.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
