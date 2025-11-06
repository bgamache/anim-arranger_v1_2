import { useState, useCallback, useRef } from "react";
import type { BackgroundTrack } from "@/types/storyboard";
import { cn } from "@/lib/utils";
import { X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackgroundTrackComponentProps {
  track: BackgroundTrack;
  timeScale: number;
  onUpdate: (trackId: string, updates: Partial<BackgroundTrack>) => void;
  onDelete: (trackId: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  snappingIncrement?: number | null;
}

const snapToGrid = (time: number, increment: number | null) => {
  if (!increment) return time;
  return Math.round(time / increment) * increment;
};

export function BackgroundTrackComponent({
  track,
  timeScale,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnd,
  snappingIncrement
}: BackgroundTrackComponentProps) {
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; startTime: number; endTime: number }>({ x: 0, startTime: 0, endTime: 0 });

  const width = (track.endTime - track.startTime) * timeScale;
  const left = track.startTime * timeScale;

  const handleMouseDown = useCallback((e: React.MouseEvent, action: 'move' | 'resize-start' | 'resize-end') => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;

    onDragStart();

    if (action === 'move') setIsMoving(true);
    else setIsResizing(action === 'resize-start' ? 'start' : 'end');

    dragStartPos.current = {
      x: e.clientX,
      startTime: track.startTime,
      endTime: track.endTime
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaTime = deltaX / timeScale;
      const { startTime: startStartTime, endTime: startEndTime } = dragStartPos.current;

      if (action === 'move') {
        const newStartTime = Math.max(0, snapToGrid(startStartTime + deltaTime, snappingIncrement));
        const duration = startEndTime - startStartTime;
        const newEndTime = newStartTime + duration;

        if (newStartTime !== track.startTime || newEndTime !== track.endTime) {
          onUpdate(track.id, { startTime: newStartTime, endTime: newEndTime });
        }
      } else if (action === 'resize-start') {
        const rawNewStartTime = startStartTime + deltaTime;
        const minDuration = 1.0;
        const maxStartTime = startEndTime - minDuration;
        const snappedStartTime = snapToGrid(Math.max(0, Math.min(maxStartTime, rawNewStartTime)), snappingIncrement);

        if (snappedStartTime !== track.startTime) {
          onUpdate(track.id, { startTime: snappedStartTime, duration: startEndTime - snappedStartTime });
        }
      } else if (action === 'resize-end') {
        const rawNewEndTime = startEndTime + deltaTime;
        const minDuration = 1.0;
        const minEndTime = startStartTime + minDuration;
        const snappedEndTime = snapToGrid(Math.max(minEndTime, rawNewEndTime), snappingIncrement);

        if (snappedEndTime !== track.endTime) {
          onUpdate(track.id, { endTime: snappedEndTime, duration: snappedEndTime - startStartTime });
        }
      }
    };

    const handleMouseUp = () => {
      setIsMoving(false);
      setIsResizing(null);
      onDragEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [track, timeScale, onUpdate, onDragStart, onDragEnd, snappingIncrement]);

  // Prefer a ready-made CSS in value when present; otherwise derive from typed fields.
  const getBackgroundPreview = () => {
    if (track.type === "gradient") {
      if (track.value) return track.value;
      if (track.gradientColors?.length) {
        const direction = track.gradientDirection || "to right";
        const colors = track.gradientColors.join(", ");
        return `linear-gradient(${direction}, ${colors})`;
      }
      return "linear-gradient(to right, #888, #444)";
    }
    if (track.type === "color") {
      return track.color || track.value || track.meta?.color || "#3b82f6";
    }
    if (track.type === "image") {
      const url =
        track.imageUrl ||
        track.value ||
        track.meta?.src ||
        track.meta?.image ||
        track.meta?.url ||
        "";
      return url ? `url(${url})` : "linear-gradient(45deg, #f0f0f0, #e0e0e0)";
    }
    return "linear-gradient(45deg, #f0f0f0, #e0e0e0)";
  };

  return (
    <div
      ref={trackRef}
      className={cn(
        "absolute bg-white/10 rounded border-2 border-purple-400/60 group cursor-move",
        "hover:border-purple-400 transition-all duration-200",
        isMoving && "shadow-lg z-10",
        isResizing && "shadow-lg z-10"
      )}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        height: '112px',
        minWidth: '40px',
        background: getBackgroundPreview(),
        backgroundSize: track.type === 'image' ? (track.imageFit || 'cover') : undefined,
        backgroundRepeat: track.type === 'image' && track.imageFit === 'repeat' ? 'repeat' : 'no-repeat',
        backgroundPosition: track.type === 'image' ? 'center' : undefined,
      }}
    >
      {/* Delete button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(track.id);
        }}
        className="absolute -top-2 -right-2 w-5 h-5 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
      >
        <X className="w-3 h-3" />
      </Button>

      {/* Resize handles */}
      <div
        className="absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize opacity-80 group-hover:opacity-100 transition-opacity bg-purple-500 hover:bg-purple-400 rounded-l flex items-center justify-center z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleMouseDown(e, 'resize-start');
        }}
      >
        <div className="w-0.5 h-8 bg-white/90 rounded-full" />
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize opacity-80 group-hover:opacity-100 transition-opacity bg-purple-500 hover:bg-purple-400 rounded-r flex items-center justify-center z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleMouseDown(e, 'resize-end');
        }}
      >
        <div className="w-0.5 h-8 bg-white/90 rounded-full" />
      </div>

      {/* Content */}
      <div
        className="flex flex-col items-center justify-center h-full cursor-move relative px-2"
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        <GripVertical className="absolute top-1 left-1 w-3 h-3 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="flex flex-col items-center justify-center gap-1 min-w-0 w-full h-full">
          <div className="text-xs font-medium text-white truncate max-w-full bg-black/40 px-1 rounded">
            {track.name}
          </div>
          <div className="text-[10px] text-white/70 bg-black/40 px-1 rounded">
            {(track.endTime - track.startTime).toFixed(1)}s
          </div>
        </div>
      </div>
    </div>
  );
}
