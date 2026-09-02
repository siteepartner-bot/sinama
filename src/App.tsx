/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RoomProvider, useRoom } from './hooks/useRoom';
import { HomePage } from './components/HomePage';
import { CreateRoom } from './components/CreateRoom';
import { JoinRoom } from './components/JoinRoom';
import { RoomPage } from './components/RoomPage';

function AppContent() {
  const { view, setView } = useRoom();

  return (
    <div className="min-h-screen bg-[#08090d] text-[#f5f5f7] flex flex-col font-sans selection:bg-rose-500 selection:text-white antialiased transition-colors duration-200">
      {/* Dynamic View Router */}
      <main className="flex-1 w-full">
        {view === 'home' && <HomePage onNavigate={setView} />}
        {view === 'create-room' && <CreateRoom />}
        {view === 'join-room' && <JoinRoom />}
        {view === 'room' && <RoomPage />}
      </main>

      {/* Footer Branding (Shows only on entry pages) */}
      {view !== 'room' && (
        <footer className="py-8 text-center text-xs text-zinc-600 border-t border-zinc-900 bg-[#08090d]/80 backdrop-blur-md">
          <p>© 2026 Roomy. تمامی حقوق مادی و معنوی محفوظ است.</p>
          <p className="mt-1 text-zinc-700">ساخته شده برای استریم همزمان فیلم، صوت و تصویر با معماری ابری کلودفلر</p>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <RoomProvider>
      <AppContent />
    </RoomProvider>
  );
}

