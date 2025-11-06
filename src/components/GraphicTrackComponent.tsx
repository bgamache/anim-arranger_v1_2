import { useState, useRef, useCallback } from "react";
import { GraphicTimelineClip } from "@/types/storyboard";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ChevronLeft } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { TransitionSpec, TransitionKey, TRANSITION_PRESETS, TRANSITION_GROUPS } from "@/types/storyboard";

// Snap utility function - snaps time to nearest increment
const snapToGrid = (time: number, snapIncrement: number | null = null): number => {
  if (snapIncrement === null) return time;
  return Math.round(time / snapIncrement) * snapIncrement;
};

const getGraphicGradient = (type: GraphicTimelineClip['type']) => {
  const gradients = {
    text: 'bg-clip-text',
    shape: 'bg-clip-shape', 
    icon: 'bg-clip-icon'
  };
  return gradients[type];
};

interface GraphicTrackComponentProps {
  clip: GraphicTimelineClip;
  timeScale: number;
  onUpdate: (clipId: string, updates: Partial<GraphicTimelineClip>) => void;
  onDelete: (clipId: string) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  snappingIncrement: number | null;
}

export function GraphicTrackComponent({
  clip,
  timeScale,
  onUpdate,
  onDelete,
  isDragging,
  onDragStart,
  onDragEnd,
  snappingIncrement
}: GraphicTrackComponentProps) {
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [openIn, setOpenIn]   = useState(false);
  const [openOut, setOpenOut] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; startTime: number; endTime: number }>({ x: 0, startTime: 0, endTime: 0 });

  const width = (clip.endTime! - clip.startTime) * timeScale;
  const left = clip.startTime * timeScale;

  const handleMouseDown = useCallback((e: React.MouseEvent, action: 'move' | 'resize-start' | 'resize-end') => {
    e.preventDefault();
    e.stopPropagation();

    if (action === 'move') {
      onDragStart();
      setIsMoving(true);
    } else {
      setIsResizing(action === 'resize-start' ? 'start' : 'end');
    }

    const startX = e.clientX;
    const startStartTime = clip.startTime;
    const startEndTime = clip.endTime!;
    
    dragStartPos.current = {
      x: startX,
      startTime: startStartTime,
      endTime: startEndTime
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaTime = deltaX / timeScale;

      if (action === 'move') {
        const newStartTime = Math.max(0, startStartTime + deltaTime);
        const snappedStartTime = snapToGrid(newStartTime, snappingIncrement);
        const duration = clip.endTime! - clip.startTime;
        
        onUpdate(clip.id, {
          startTime: snappedStartTime,
          endTime: snappedStartTime + duration
        });
      } else if (action === 'resize-start') {
        const rawNewStartTime = startStartTime + deltaTime;
        const minDuration = 0.1;
        const maxStartTime = startEndTime - minDuration;
        const snappedStartTime = snapToGrid(Math.max(0, Math.min(rawNewStartTime, maxStartTime)), snappingIncrement);
        
        if (snappedStartTime !== startStartTime) {
          onUpdate(clip.id, {
            startTime: snappedStartTime,
            duration: clip.endTime! - snappedStartTime
          });
        }
      } else if (action === 'resize-end') {
        const rawNewEndTime = startEndTime + deltaTime;
        const minDuration = 0.1;
        const minEndTime = startStartTime + minDuration;
        const snappedEndTime = snapToGrid(Math.max(minEndTime, rawNewEndTime), snappingIncrement);
        
        if (snappedEndTime !== startEndTime) {
          onUpdate(clip.id, {
            endTime: snappedEndTime,
            duration: snappedEndTime - clip.startTime
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      setIsMoving(false);
      onDragEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [clip, timeScale, onUpdate, onDragStart, onDragEnd, snappingIncrement]);

  function TransitionPicker({
    value,
    onChange,
    label,
    onDone
  }: {
    value?: TransitionSpec;
    onChange: (v: TransitionSpec | undefined) => void;
    label: string;
    onDone?: () => void;
  }) {
    // Your type expects: { type: TransitionName; duration: number; ease?: string }
    const current = value ?? { type: "none", duration: 350, ease: "ease" };

    const [typeKey, setTypeKey] = useState<TransitionKey>(current.type as TransitionKey);
    const [durationMs, setDurationMs] = useState<number>(current.duration ?? 350);
    const [ease, setEase] = useState<string>(current.ease ?? "ease");

    const applyType = (key: TransitionKey) => {
      setTypeKey(key);
      const preset = TRANSITION_PRESETS.find((p) => p.key === key);
      if (preset) {
        // Show the preset’s defaults in the editors
        setDurationMs(preset.spec.duration ?? 350);
        setEase(preset.spec.ease ?? "ease");
      }
    };

  const handleSave = () => {
    // Resolve to the preset to get the canonical spec, then override with UI values
    const preset = TRANSITION_PRESETS.find((p) => p.key === typeKey);
    const base = preset?.spec ?? { type: "none", duration: 350, ease: "ease" };
    const next: TransitionSpec = { ...base, type: typeKey, duration: durationMs, ease };
    onChange(next);
    onDone?.();
  };

   const handleClear = () => {
    onChange(undefined);
    onDone?.();
  };

  const EASE_OPTIONS = [
    "linear",
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "cubic-bezier(0.4,0,0.2,1)", // tailwind default-ish
  ];

  return (
    <div
      className="space-y-3 w-64"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-sm font-medium">{label}</div>

      {/* Transition type dropdown */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Type</div>
        <Select value={typeKey} onValueChange={(v) => applyType(v as TransitionKey)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Choose a transition…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TRANSITION_GROUPS.map((group) => {
              const items = TRANSITION_PRESETS.filter((p) => p.group === group);
              if (!items.length) return null;
              return (
                <div key={group}>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                    {group}
                  </div>
                  {items.map((p) => (
                    <SelectItem key={p.key} value={p.key} className="pl-4">
                      {p.label}
                    </SelectItem>
                  ))}
                </div>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Duration */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Duration (ms)</div>
        <Input
          type="number"
          min={0}
          value={durationMs}
          onChange={(e) => setDurationMs(Math.max(0, Number(e.target.value || 0)))}
          className="h-8"
        />
      </div>

      {/* Ease */}
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Ease</div>
        <Select value={ease} onValueChange={(v) => setEase(v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Choose easing…" />
          </SelectTrigger>
          <SelectContent>
            {EASE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={handleClear}>
          Clear
        </Button>
        <Button size="sm" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

  return (
    <div
      ref={clipRef}
      className={cn(
        "absolute h-full rounded border-2 border-white/20 shadow-clip",
        "transition-all duration-200 hover:border-white/40 hover:shadow-elevated",
        "group select-none cursor-move",
        getGraphicGradient(clip.type),
        {
          "opacity-60 scale-105 z-10": isDragging,
          "ring-2 ring-primary/50": isMoving || isResizing,
        }
      )}
      style={{
        left: `${left}px`,
        width: `${Math.max(width, 40)}px`
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
    >
      {/* Resize handle - start */}
      <div
        className="absolute left-0 top-0 w-3 h-full cursor-ew-resize bg-white/10 hover:bg-white/20 transition-colors rounded-l border-r border-white/20 flex items-center justify-center"
        onMouseDown={(e) => handleMouseDown(e, 'resize-start')}
      >
          <div className="w-0.5 h-4 bg-white/30 rounded-full" >
            <Popover open={ openIn } onOpenChange={ setOpenIn }>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconXs"
                  className="absolute h-5 -bottom-0 -left-0 rounded text-white"
                  onClick={(e) => { e.stopPropagation(); setOpenIn((v) => !v); }}      // prevent dragging
                  aria-label="Pick transition in"
                >
                  <ChevronLeft size={11} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="p-3"
              >
                <TransitionPicker
                  label="Transition In"
                  value={clip.transitionsIn}
                  onChange={(val) => onUpdate(clip.id, { transitionsIn: val })}
                  onDone={() => setOpenIn(false)}
                />
              </PopoverContent>
            </Popover>
          </div>
        <div className="w-0.5 h-8 bg-white/80 rounded-full" />
      </div>
      
      {/* Resize handle - end */}
      <div
        className="absolute right-0 top-0 w-3 h-full cursor-ew-resize bg-white/10 hover:bg-white/20 transition-colors rounded-r border-l border-white/20 flex items-center justify-center"
        onMouseDown={(e) => handleMouseDown(e, 'resize-end')}
      >
          <div className="w-0.5 h-8 bg-white/80 rounded-full" >
            {/* Picker button (popover) */}
            <Popover open={ openOut } onOpenChange={ setOpenOut }>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconXs"
                  className="absolute h-5 -bottom-0 -right-0 rounded text-white"
                  onClick={(e) => { e.stopPropagation(); setOpenOut((v) => !v); }}      // prevent dragging
                  aria-label="Pick transition out"
                >
                  <ChevronRight size={11} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="p-3"
              >
                <TransitionPicker
                  label="Transition Out"
                  value={clip.transitionsOut}
                  onChange={(val) => onUpdate(clip.id, { transitionsOut: val })}
                  onDone={() => setOpenOut(false)}
                />
              </PopoverContent>
            </Popover>
          </div>
        <div className="w-0.5 h-8 bg-white/80 rounded-full" />
      </div>

      {/* Clip content */}
      <div className="flex items-center justify-center h-full text-white text-xs font-medium px-4">
        <span className="text-lg mr-2">{clip.icon}</span>
        <span className="truncate font-semibold text-shadow-sm">{clip.name}</span>
      
      {/* Delete button */}
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