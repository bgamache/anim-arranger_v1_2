import { useState, useRef, useCallback } from "react";
import { TimelineClip } from "@/types/storyboard";
import { X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Snap utility function - snaps time to nearest increment
const snapToGrid = (time: number, snapIncrement: number | null = null): number => {
  if (snapIncrement === null) return time;
  return Math.round(time / snapIncrement) * snapIncrement;
};

interface TimelineClipComponentProps {
  clip: TimelineClip;
  timeScale: number;
  onUpdate: (clipId: string, updates: Partial<TimelineClip>) => void;
  onDelete: (clipId: string) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  snappingIncrement: number | null;
  customThumbnail?: string;
}

const getClipGradient = (type: TimelineClip['type']) => {
  const gradients = {
    fade: 'bg-clip-fade',
    slide: 'bg-clip-slide',
    zoom: 'bg-clip-zoom',
    rotate: 'bg-clip-rotate',
    bounce: 'bg-clip-bounce',
    elastic: 'bg-clip-elastic'
  } as const;
  return gradients[type] ?? 'bg-clip-fade';
};

export function TimelineClipComponent({
  clip,
  timeScale,
  onUpdate,
  onDelete,
  isDragging,
  onDragStart,
  onDragEnd,
  snappingIncrement,
  customThumbnail
}: TimelineClipComponentProps) {
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);

  // --- Defensive timing so width/left always valid ---
  const effectiveStart = Math.max(0, clip.startTime ?? 0);
  const effectiveDuration =
    (clip.endTime != null ? clip.endTime - effectiveStart : clip.duration ?? 0) || 0;
  const effectiveEnd = clip.endTime ?? (effectiveStart + effectiveDuration);

  const width = Math.max((effectiveEnd - effectiveStart) * timeScale, 40); // min width
  const left = effectiveStart * timeScale;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, action: 'move' | 'resize-start' | 'resize-end') => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) return;

      const startX = e.clientX;
      const startStartTime = effectiveStart;
      const startEndTime = effectiveEnd;

      if (action === 'move') {
        setIsMoving(true);
        onDragStart();
      } else if (action === 'resize-start') {
        setIsResizing('start');
      } else if (action === 'resize-end') {
        setIsResizing('end');
      }

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX;
        const deltaTime = deltaX / timeScale;

        if (action === 'move') {
          const rawNewStartTime = startStartTime + deltaTime;
          const snappedStartTime = snapToGrid(Math.max(0, rawNewStartTime), snappingIncrement);
          const duration = startEndTime - startStartTime;
          onUpdate(clip.id, { startTime: snappedStartTime, endTime: snappedStartTime + duration });
        } else if (action === 'resize-start') {
          const rawNewStartTime = startStartTime + deltaTime;
          const minDuration = 1.0;
          const maxStartTime = startEndTime - minDuration;
          const snappedStartTime = snapToGrid(
            Math.max(0, Math.min(maxStartTime, rawNewStartTime)),
            snappingIncrement
          );
          if (snappedStartTime !== startStartTime) {
            onUpdate(clip.id, { startTime: snappedStartTime });
          }
        } else if (action === 'resize-end') {
          const rawNewEndTime = startEndTime + deltaTime;
          const minDuration = 1.0;
          const minEndTime = startStartTime + minDuration;
          const snappedEndTime = snapToGrid(Math.max(minEndTime, rawNewEndTime), snappingIncrement);
          if (snappedEndTime !== startEndTime) {
            onUpdate(clip.id, { endTime: snappedEndTime });
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
    },
    [clip.id, effectiveStart, effectiveEnd, onUpdate, onDragStart, onDragEnd, snappingIncrement, timeScale]
  );

  // --- Thumbnail / video preview (clamped to a fixed box; never grows with clip width) ---
  const renderMedia = () => {
    const galleryThumbs = JSON.parse(localStorage.getItem('customThumbnails') || '{}');
    const videoPreviewUrls = JSON.parse(localStorage.getItem('videoPreviewUrls') || '{}');

    const baseId = (clip.animationId ?? clip.id ?? '').replace(/-\d+$/, '');
    const candidates = [
      customThumbnail,
      galleryThumbs[clip.animationId ?? ''],
      galleryThumbs[baseId],
      galleryThumbs[clip.id ?? ''],
    ].filter(Boolean);

    const videoUrl =
      videoPreviewUrls[clip.animationId ?? ''] ||
      videoPreviewUrls[baseId] ||
      videoPreviewUrls[clip.id ?? ''];

    // Fixed-size media box: prevents growth beyond clip bounds
    const Box: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <div
        className="w-16 h-16 sm:w-20 sm:h-20 rounded shadow-sm flex-shrink-0"
        // Ensure the box never exceeds its parent height
        style={{ maxHeight: "calc(100% - 16px)" }}
      >
        {children}
      </div>
    );

    if (videoUrl) {
      return (
        <Box>
          <video
            src={videoUrl}
            className="w-full h-full object-contain"
            loop
            muted
            playsInline
            autoPlay
          />
        </Box>
      );
    }

    if (candidates.length > 0) {
      const url = candidates[0] as string;
      return (
        <Box>
          <img src={url} alt={clip.name} className="w-full h-full object-contain" />
        </Box>
      );
    }

    // Fallback: emoji/icon (also clamped by the same box)
    return (
      <Box>
        <div className="w-full h-full flex items-center justify-center text-3xl sm:text-4xl">
          {clip.icon}
        </div>
      </Box>
    );
  };

  return (
    <div
      ref={clipRef}
      className={cn(
        "absolute h-full rounded border-2 border-white/20 shadow-clip", // <-- overflow-hidden added
        "transition-all duration-200 hover:border-white/40 hover:shadow-elevated",
        "group select-none",
        getClipGradient(clip.type),
        { "opacity-60 scale-105 z-10": isDragging, "ring-2 ring-primary/50": isMoving || isResizing }
      )}
      style={{ left: `${left}px`, width: `${width}px` }}
    >
      {/* Resize handles */}
      <div
        className="absolute left-0 top-0 w-3 h-full cursor-ew-resize bg-white/10 hover:bg-white/20 transition-colors rounded-l border-r border-white/20 flex items-center justify-center"
        onMouseDown={(e) => handleMouseDown(e, 'resize-start')}
        title="Resize clip start"
      >
        <div className="w-0.5 h-8 bg-white/80 rounded-full" />
      </div>
      <div
        className="absolute right-0 top-0 w-3 h-full cursor-ew-resize bg-white/10 hover:bg-white/20 transition-colors rounded-r border-l border-white/20 flex items-center justify-center"
        onMouseDown={(e) => handleMouseDown(e, 'resize-end')}
        title="Resize clip end"
      >
        <div className="w-0.5 h-8 bg-white/80 rounded-full" />
      </div>

      {/*Clip Content */}
      <div
        className="flex items-center justify-center h-full text-white text-xs font-medium px-4"
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        <div className="flex flex-col items-center justify-center gap-2 min-w-0 w-full h-full py-2">
          <div className="flex-shrink-0 flex items-center justify-center">
            {renderMedia()}
          </div>
            <div className="text-center min-w-0 w-full">
              <div className="text-xs font-medium text-white truncate">{clip.name}</div>
              <div className="text-xs text-white/70">
                {(effectiveEnd - effectiveStart).toFixed(1)}s
              </div>
            </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-full shadow-lg border border-red-400"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(clip.id);
          }}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
