import React, { useState, useRef, useCallback, useEffect } from 'react';
import { formatVideoTime } from '../../utils/mediaParsers';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  bufferedTime?: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

export function ProgressBar({
  currentTime,
  duration,
  bufferedTime = 0,
  onSeek,
  disabled = false,
}: ProgressBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [hoverPosition, setHoverPosition] = useState(0); // 0 to 1
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lastEmitTimeRef = useRef<number>(0);

  const displayTime = isDragging && dragTime !== null ? dragTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedTime / duration) * 100) : 0;

  const calculateTargetTime = useCallback(
    (clientX: number) => {
      if (!barRef.current || duration <= 0) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(pos * duration * 10) / 10;
    },
    [duration]
  );

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return;
    setIsDragging(true);
    const targetTime = calculateTargetTime(e.clientX);
    setDragTime(targetTime);
    lastEmitTimeRef.current = Date.now();

    const onWindowMouseMove = (moveEvent: MouseEvent) => {
      const time = calculateTargetTime(moveEvent.clientX);
      setDragTime(time);
      // Strictly visual during drag: do not emit intermediate seek events to reduce WebSocket traffic
    };

    const onWindowMouseUp = (upEvent: MouseEvent) => {
      setIsDragging(false);
      const finalTime = calculateTargetTime(upEvent.clientX);
      setDragTime(null);
      // Final authoritative seek event
      onSeek(finalTime);

      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  };

  const hoverTime = hoverPosition * duration;

  return (
    <div
      ref={barRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      className={`relative w-full h-2 py-2 flex items-center cursor-pointer group/seeker select-none ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
      id="video-seek-bar"
    >
      {/* Track Background */}
      <div className="relative w-full h-1.5 group-hover/seeker:h-2 bg-zinc-800/80 rounded-full overflow-hidden transition-all">
        {/* Buffered Track */}
        <div
          style={{ width: `${bufferedPercent}%` }}
          className="absolute top-0 bottom-0 left-0 bg-zinc-700/50 rounded-full transition-all"
        />

        {/* Elapsed Progress Track */}
        <div
          style={{ width: `${progressPercent}%` }}
          className="absolute top-0 bottom-0 left-0 bg-rose-500 rounded-full"
        />
      </div>

      {/* Scrubber Knob / Handle */}
      <div
        style={{ left: `${progressPercent}%` }}
        className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-rose-500 rounded-full shadow-lg transition-transform pointer-events-none ${
          isHovered || isDragging ? 'scale-100' : 'scale-0'
        }`}
      />

      {/* Hover Time Tooltip */}
      {isHovered && duration > 0 && (
        <div
          style={{ left: `${hoverPosition * 100}%` }}
          className="absolute bottom-6 -translate-x-1/2 px-2 py-0.5 bg-zinc-900 border border-zinc-700/80 text-[11px] font-mono font-medium text-zinc-100 rounded-md shadow-xl pointer-events-none whitespace-nowrap z-30"
        >
          {formatVideoTime(hoverTime)}
        </div>
      )}
    </div>
  );
}
