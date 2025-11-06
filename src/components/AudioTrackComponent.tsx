import { useRef, useCallback, useState } from "react";
import { AudioTrack } from "@/types/storyboard";
import { Button } from "@/components/ui/button";
import { Music, X, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioTrackComponentProps {
  track: AudioTrack;
  timeScale: number;
  onUpdate: (track: AudioTrack) => void;
  onDelete: (trackId: string) => void;
  isDragging: boolean;
  onDragStart: (trackId: string) => void;
  onDragEnd: () => void;
  snappingIncrement?: number | null;
}

const snapToGrid = (time: number, snapIncrement: number | null = null): number => {
  if (snapIncrement && snapIncrement > 0) {
    return Math.round(time / snapIncrement) * snapIncrement;
  }
  return time;
};

export function AudioTrackComponent({
  track,
  timeScale,
  onUpdate,
  onDelete,
  isDragging,
  onDragStart,
  onDragEnd,
  snappingIncrement
}: AudioTrackComponentProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const dragStartPosRef = useRef({ x: 0, startTime: 0, endTime: 0 });

  const width = track.duration * timeScale;
  const left = track.startTime * timeScale;

  const handleMouseDown = useCallback((e: React.MouseEvent, action: 'move' | 'resize-start' | 'resize-end') => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    dragStartPosRef.current = {
      x: startX,
      startTime: track.startTime,
      endTime: track.endTime
    };

    if (action === 'move') {
      setIsMoving(true);
      onDragStart(track.id);
    } else {
      setIsResizing(true);
    }

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaTime = deltaX / timeScale;

      if (action === 'move') {
        const newStartTime = Math.max(0, dragStartPosRef.current.startTime + deltaTime);
        const snappedStartTime = snapToGrid(newStartTime, snappingIncrement);
        const duration = track.endTime - track.startTime;
        
        onUpdate({
          ...track,
          startTime: snappedStartTime,
          endTime: snappedStartTime + duration
        });
      } else if (action === 'resize-start') {
        const newStartTime = Math.max(0, Math.min(
          dragStartPosRef.current.startTime + deltaTime,
          track.endTime - 0.1
        ));
        const snappedStartTime = snapToGrid(newStartTime, snappingIncrement);
        
        onUpdate({
          ...track,
          startTime: snappedStartTime
        });
      } else if (action === 'resize-end') {
        const newEndTime = Math.max(
          track.startTime + 0.1,
          dragStartPosRef.current.endTime + deltaTime
        );
        const snappedEndTime = snapToGrid(newEndTime, snappingIncrement);
        
        onUpdate({
          ...track,
          endTime: snappedEndTime,
          duration: snappedEndTime - track.startTime
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setIsMoving(false);
      onDragEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [track, timeScale, onUpdate, onDragStart, onDragEnd, snappingIncrement]);

  return (
    <div
      ref={trackRef}
      className={cn(
        "absolute top-1 bottom-1 bg-gradient-to-r from-blue-500/80 to-blue-600/80 border border-blue-300 rounded cursor-move select-none shadow-sm transition-all duration-200 group hover:shadow-md",
        isDragging && "opacity-50",
        isMoving && "z-10 shadow-lg",
        isResizing && "z-10"
      )}
      style={{ 
        width: `${width}px`, 
        left: `${left}px`,
        minWidth: '40px'
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
    >
      {/* Resize handle - start */}
      <div
        className="absolute left-0 top-0 w-2 h-full bg-blue-400 cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity rounded-l"
        onMouseDown={(e) => handleMouseDown(e, 'resize-start')}
      />
      
      {/* Resize handle - end */}
      <div
        className="absolute right-0 top-0 w-2 h-full bg-blue-400 cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity rounded-r"
        onMouseDown={(e) => handleMouseDown(e, 'resize-end')}
      />

      {/* Track content */}
      <div className="flex items-center h-full px-2 text-white text-xs font-medium gap-1">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Volume2 className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{track.name}</span>
        </div>
        
        {width > 80 && (
          <span className="text-blue-100 text-xs flex-shrink-0">
            {track.duration.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Delete button */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-500 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(track.id);
        }}
      >
        <X className="w-3 h-3" />
      </Button>

      {/* Waveform representation (simplified) */}
      <div className="absolute bottom-1 left-2 right-2 h-1 bg-blue-200/50 rounded overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-300/60 to-blue-200/60 rounded" />
      </div>
    </div>
  );
}