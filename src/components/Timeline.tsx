// src/components/Timeline.tsx
import { useState, useRef, useCallback, useEffect } from "react";
import {
  TimelineClip,
  AudioTrack,
  BackgroundTrack,
  GraphicTimelineClip,
  Track,
} from "@/types/storyboard";
import { TimelineClipComponent } from "./TimelineClipComponent";
import { AudioTrackComponent } from "./AudioTrackComponent";
import { BackgroundTrackComponent } from "./BackgroundTrackComponent";
import { GraphicTrackComponent } from "./GraphicTrackComponent";
import { AudioImportDialog } from "./AudioImportDialog";
import { AddBackgroundDialog } from "./AddBackgroundDialog";
import { audioManager } from "@/lib/audioManager";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Magnet,
  Clock,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  GripVertical,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// --- helper: extract a character-set label from the drag payload ---
function resolveSourceSetLabel(d: any): string | undefined {
  return (
    d?.sourceSetName ||
    d?.sourceSetId ||
    d?.clip?.meta?.characterSet ||
    d?.meta?.characterSet ||
    undefined
  );
}

interface TimelineProps {
  clips: TimelineClip[];
  onClipsChange: (clips: TimelineClip[]) => void;
  audioTracks: AudioTrack[];
  onAudioTracksChange: (tracks: AudioTrack[]) => void;
  backgroundTracks: BackgroundTrack[];
  onBackgroundTracksChange: (tracks: BackgroundTrack[]) => void;
  graphics: GraphicTimelineClip[];
  onGraphicsChange: (graphics: GraphicTimelineClip[]) => void;
  tracks?: Track[];
  onTracksChange?: (tracks: Track[]) => void;
  currentTime: number;
  onTimeChange: (time: number) => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  customThumbnails?: Record<string, string>;
  onThumbnailsChange?: (thumbnails: Record<string, string>) => void;
}

export function Timeline({
  clips,
  onClipsChange,
  audioTracks,
  onAudioTracksChange,
  backgroundTracks,
  onBackgroundTracksChange,
  graphics,
  onGraphicsChange,
  tracks = [],
  onTracksChange = () => {},
  currentTime,
  onTimeChange,
  isPlaying,
  onPlayToggle,
  customThumbnails,
  onThumbnailsChange,
}: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const [draggedAudioId, setDraggedAudioId] = useState<string | null>(null);

  // DnD visualization
  const [hoverTrackId, setHoverTrackId] = useState<string | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const [emptyHover, setEmptyHover] = useState<boolean>(false);
  const [emptyHoverTime, setEmptyHoverTime] = useState<number | null>(null);

  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [snappingIncrement, setSnappingIncrement] = useState<number | null>(null);
  const [timelineDuration, setTimelineDuration] = useState(20);
  const [timeScale, setTimeScale] = useState(40);
  const [audioPreloadStatus, setAudioPreloadStatus] = useState<Record<string, boolean>>({});
  const [timelineDurationDraft, setTimelineDurationDraft] = useState("20");

  // Track reordering / rename
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string>("");

  const [draggingBgId, setDraggingBgId] = useState<string | null>(null);
  const [dragOverBgId, setDragOverBgId] = useState<string | null>(null);

  const maxTime = Math.max(
    timelineDuration,
    ...(clips || []).map((clip) => clip.endTime || 0),
    ...(audioTracks || []).map((track) => track.endTime || 0),
    ...(graphics || []).map((graphic) => graphic.endTime || 0),
    ...(backgroundTracks || []).map((bg) => bg.endTime || 0), // include backgrounds
    ...tracks.flatMap((track) => track.clips.map((clip) => clip.endTime || 0))
  );

  // zoom
  const zoomLevels = [10, 20, 40, 60, 80, 100, 120, 160, 200];
  const currentZoomIndex = zoomLevels.indexOf(timeScale);
  const handleZoomIn = useCallback(
    () => setTimeScale(zoomLevels[Math.min(currentZoomIndex + 1, zoomLevels.length - 1)]),
    [currentZoomIndex]
  );
  const handleZoomOut = useCallback(
    () => setTimeScale(zoomLevels[Math.max(currentZoomIndex - 1, 0)]),
    [currentZoomIndex]
  );

  // snapping
  const snapTime = useCallback(
    (time: number) =>
      snappingIncrement === null ? time : Math.round(time / snappingIncrement) * snappingIncrement,
    [snappingIncrement]
  );
  const snappingOptions = [
    { value: null, label: "Off" },
    { value: 1, label: "1s" },
    { value: 0.5, label: "0.5s" },
    { value: 0.25, label: "0.25s" },
  ];
  const currentSnappingLabel =
    snappingOptions.find((opt) => opt.value === snappingIncrement)?.label || "Off";

  // audio: preload & sync
  useEffect(() => {
    setTimelineDurationDraft(String(timelineDuration));
  }, [timelineDuration]);

  useEffect(() => {
    const preloadTracks = async () => {
      const newStatus: Record<string, boolean> = {};
      for (const track of audioTracks) {
        if (!audioPreloadStatus[track.id]) {
          try {
            await audioManager.preloadAudio(track);
            newStatus[track.id] = true;
          } catch {
            newStatus[track.id] = false;
          }
        } else {
          newStatus[track.id] = audioPreloadStatus[track.id];
        }
      }
      const currentTrackIds = new Set((audioTracks || []).map((t) => t.id));
      Object.keys(audioPreloadStatus).forEach((trackId) => {
        if (!currentTrackIds.has(trackId)) audioManager.removeTrack(trackId);
        else newStatus[trackId] = audioPreloadStatus[trackId];
      });
      setAudioPreloadStatus(newStatus);
    };
    preloadTracks();
    return () => {
      if (audioTracks.length === 0) audioManager.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(audioTracks || []).map((t) => `${t.id}:${t.audioUrl}`).join(",")]);

  useEffect(() => {
    if (!isPlaying) {
      audioManager.pauseAll();
      return;
    }
    (audioTracks || []).forEach((track) => {
      if (audioPreloadStatus[track.id]) {
        audioManager.syncAudio(track.id, currentTime, isPlaying, track.startTime, track.endTime);
      }
    });
  }, [isPlaying, currentTime, audioTracks, audioPreloadStatus]);

  const handleAudioTrackAdd = useCallback(
    (audioTrack: AudioTrack) => {
      onAudioTracksChange([...(audioTracks || []), audioTrack]);
      const end =
        audioTrack.endTime ?? (audioTrack.startTime ?? 0) + (audioTrack.duration ?? 0);
      if (end && end > timelineDuration) setTimelineDuration(Math.ceil(end));
    },
    [audioTracks, onAudioTracksChange, timelineDuration]
  );

  const handleAudioUpdate = useCallback(
  (updated: AudioTrack) => {
    const next = (audioTracks || []).map(t => (t.id === updated.id ? updated : t));
    onAudioTracksChange(next);
  },
  [audioTracks, onAudioTracksChange]
);

const handleAudioDelete = useCallback(
  (id: string) => {
    const next = (audioTracks || []).filter(t => t.id !== id);
    onAudioTracksChange(next);
  },
  [audioTracks, onAudioTracksChange]
);

  // Background handlers — stay in backgroundTracks
  const handleBackgroundAdd = useCallback(
    (bg: BackgroundTrack) => {
      const next = [...(backgroundTracks || []), bg];
      onBackgroundTracksChange(next);
      if (bg.endTime > timelineDuration) setTimelineDuration(Math.ceil(bg.endTime));
    },
    [backgroundTracks, onBackgroundTracksChange, timelineDuration]
  );

  const handleBackgroundUpdate = useCallback(
    (id: string, updates: Partial<BackgroundTrack>) => {
      const next = (backgroundTracks || []).map((t) =>
        t.id === id ? { ...t, ...updates } : t
      );
      onBackgroundTracksChange(next);
    },
    [backgroundTracks, onBackgroundTracksChange]
  );

  const handleBackgroundDelete = useCallback(
    (id: string) => {
      const next = (backgroundTracks || []).filter((t) => t.id !== id);
      onBackgroundTracksChange(next);
    },
    [backgroundTracks, onBackgroundTracksChange]
  );

  // debounced seek → audio sync
  const lastSeekTimeRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastSeekTimeRef.current < 100) return;
    lastSeekTimeRef.current = now;
    (audioTracks || []).forEach((track) => {
      if (audioPreloadStatus[track.id]) {
        audioManager.syncAudio(track.id, currentTime, isPlaying, track.startTime, track.endTime);
      }
    });
  }, [currentTime, audioTracks, audioPreloadStatus, isPlaying]);

  // playback loop
  const onTimeChangeRef = useRef(onTimeChange);
  const onPlayToggleRef = useRef(onPlayToggle);
  useEffect(() => {
    onTimeChangeRef.current = onTimeChange;
  }, [onTimeChange]);
  useEffect(() => {
    onPlayToggleRef.current = onPlayToggle;
  }, [onPlayToggle]);
  const rafIdRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const playheadRef = useRef<number>(0);
  useEffect(() => {
    if (!isPlaying) return;
    playheadRef.current = currentTime;
    lastTsRef.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, (now - lastTsRef.current) / 1000);
      lastTsRef.current = now;
      playheadRef.current += dt;
      if (playheadRef.current >= maxTime) {
        onTimeChangeRef.current(maxTime);
        onPlayToggleRef.current();
        return;
      }
      onTimeChangeRef.current(playheadRef.current);
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    };
  }, [isPlaying, maxTime]);

  // skip
  const handleSkipBack = useCallback(
    () => onTimeChange(Math.max(0, currentTime - 5)),
    [currentTime, onTimeChange]
  );
  const handleSkipForward = useCallback(
    () => onTimeChange(Math.min(maxTime, currentTime + 5)),
    [currentTime, maxTime, onTimeChange]
  );

  // playhead drag
  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingPlayhead(true);
      const handleMouseMove = (e: MouseEvent) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - 80;
        const time = Math.max(0, Math.min(maxTime, x / timeScale));
        onTimeChange(snapTime(time));
      };
      const handleMouseUp = () => {
        setIsDraggingPlayhead(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [maxTime, onTimeChange, timeScale, snapTime]
  );

  const handleTimelineMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - 80;
      const time = Math.max(0, Math.min(maxTime, x / timeScale));
      onTimeChange(snapTime(time));
      setIsDraggingPlayhead(true);
      const handleMouseMove = (e: MouseEvent) => {
        if (!timelineRef.current) return;
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - 80;
        const time = Math.max(0, Math.min(maxTime, x / timeScale));
        onTimeChange(snapTime(time));
      };
      const handleMouseUp = () => {
        setIsDraggingPlayhead(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [maxTime, onTimeChange, timeScale, snapTime]
  );

  // normal tracks
  const handleAddTrack = useCallback(() => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: `Track ${tracks.length + 1}`,
      clips: [],
    };
    onTracksChange([...tracks, newTrack]);
  }, [tracks, onTracksChange]);

  const handleDeleteTrack = useCallback(
    (trackId: string) => {
      const updatedTracks = tracks.filter((t) => t.id !== trackId);
      onTracksChange(updatedTracks);
    },
    [tracks, onTracksChange]
  );

  // reorder tracks
  const handleTrackDragStart = useCallback((e: React.DragEvent, trackId: string) => {
    e.stopPropagation();
    setDraggingTrackId(trackId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/track-reorder", JSON.stringify({ trackId }));
  }, []);
  const handleTrackDragOver = useCallback(
    (e: React.DragEvent, targetTrackId: string) => {
      const hasReorderPayload = !!e.dataTransfer.types.includes("application/track-reorder");
      if (!hasReorderPayload) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOverTrackId(targetTrackId);
      e.dataTransfer.dropEffect = "move";
    },
    []
  );
  const handleTrackDrop = useCallback(
    (e: React.DragEvent, targetTrackId: string) => {
      const hasReorderPayload = !!e.dataTransfer.types.includes("application/track-reorder");
      if (!hasReorderPayload) return;
      e.preventDefault();
      e.stopPropagation();
      const payload = JSON.parse(e.dataTransfer.getData("application/track-reorder") || "{}");
      const sourceId: string | undefined = payload.trackId;
      if (!sourceId || sourceId === targetTrackId) {
        setDraggingTrackId(null);
        setDragOverTrackId(null);
        return;
      }
      const srcIdx = tracks.findIndex((t) => t.id === sourceId);
      const dstIdx = tracks.findIndex((t) => t.id === targetTrackId);
      if (srcIdx === -1 || dstIdx === -1) {
        setDraggingTrackId(null);
        setDragOverTrackId(null);
        return;
      }
      const next = [...tracks];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      onTracksChange(next);
      setDraggingTrackId(null);
      setDragOverTrackId(null);
    },
    [tracks, onTracksChange]
  );
  const handleTrackDragEnd = useCallback(() => {
    setDraggingTrackId(null);
    setDragOverTrackId(null);
  }, []);

  // --- Background track reordering handlers ---
  const handleBgDragStart = useCallback((e: React.DragEvent, bgId: string) => {
    e.stopPropagation();
    setDraggingBgId(bgId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/bg-reorder", JSON.stringify({ bgId }));
  }, []);

  const handleBgDragOver = useCallback(
    (e: React.DragEvent, targetBgId: string) => {
      const hasPayload = e.dataTransfer.types.includes("application/bg-reorder");
      if (!hasPayload) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOverBgId(targetBgId);
      e.dataTransfer.dropEffect = "move";
    },
    []
  );

  const handleBgDrop = useCallback(
    (e: React.DragEvent, targetBgId: string) => {
      const hasPayload = e.dataTransfer.types.includes("application/bg-reorder");
      if (!hasPayload) return;
      e.preventDefault();
      e.stopPropagation();
      const payload = JSON.parse(e.dataTransfer.getData("application/bg-reorder") || "{}");
      const sourceId: string | undefined = payload.bgId;
      if (!sourceId || sourceId === targetBgId) {
        setDraggingBgId(null);
        setDragOverBgId(null);
        return;
      }
      const srcIdx = (backgroundTracks || []).findIndex((b) => b.id === sourceId);
      const dstIdx = (backgroundTracks || []).findIndex((b) => b.id === targetBgId);
      if (srcIdx === -1 || dstIdx === -1) {
        setDraggingBgId(null);
        setDragOverBgId(null);
        return;
      }
      const next = [...(backgroundTracks || [])];
      const [moved] = next.splice(srcIdx, 1);
      next.splice(dstIdx, 0, moved);
      onBackgroundTracksChange(next);
      setDraggingBgId(null);
      setDragOverBgId(null);
    },
    [backgroundTracks, onBackgroundTracksChange]
  );

  const handleBgDragEnd = useCallback(() => {
    setDraggingBgId(null);
    setDragOverBgId(null);
  }, []);

  // rename
  const beginRename = useCallback((trackId: string, currentName: string) => {
    setEditingTrackId(trackId);
    setNameDraft(currentName);
  }, []);
  const cancelRename = useCallback(() => {
    setEditingTrackId(null);
    setNameDraft("");
  }, []);
  const commitRename = useCallback(() => {
    if (!editingTrackId) return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      cancelRename();
      return;
    }
    const next = tracks.map((t) =>
      t.id === editingTrackId ? { ...t, name: trimmed } : t
    );
    onTracksChange(next);
    setEditingTrackId(null);
    setNameDraft("");
  }, [editingTrackId, nameDraft, tracks, onTracksChange, cancelRename]);

  // per-track clip drop
  const onDragOverTrack = useCallback(
    (e: React.DragEvent, trackId: string) => {
      if (draggingTrackId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = Math.max(0, x / timeScale);
      setHoverTrackId(trackId);
      setHoverTime(t);
    },
    [timeScale, draggingTrackId]
  );
  const onDragLeaveTrack = useCallback(
    (e: React.DragEvent, trackId: string) => {
      const current = e.currentTarget as HTMLDivElement;
      if (!current.contains(e.relatedTarget as Node)) {
        if (hoverTrackId === trackId) {
          setHoverTrackId(null);
          setHoverTime(null);
        }
      }
    },
    [hoverTrackId]
  );

  const onDropOnTrack = useCallback(
    (e: React.DragEvent, track: Track) => {
      if (e.dataTransfer.types.includes("application/track-reorder")) return;
      e.preventDefault();
      setHoverTrackId(null);
      setHoverTime(null);

      try {
        const raw =
          e.dataTransfer.getData("application/x-clip") ||
          e.dataTransfer.getData("application/json") ||
          "";
        const dragData = raw ? JSON.parse(raw) : {};
        const sourceSetLabel = resolveSourceSetLabel(dragData);

        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const startTime = Math.max(0, x / timeScale);

        if (
          dragData.animationId ||
          (dragData.id && dragData.duration && dragData.type && !dragData.clip)
        ) {
          const duration = dragData.duration || 3;
          const newClip: TimelineClip = {
            id: `${dragData.id}-${Date.now()}`,
            animationId: dragData.animationId || dragData.id,
            name: dragData.name || "Action",
            startTime,
            duration,
            endTime: startTime + duration,
            type: dragData.type || "fade",
            icon: dragData.icon || "zap",
            description: dragData.description || "Animation clip",
            x: 50,
            y: 50,
            width: 200,
            height: 150,
            // ✅ preserve character set metadata
            meta: {
              ...(dragData.clip?.meta || dragData.meta || {}),
              ...(sourceSetLabel ? { characterSet: sourceSetLabel } : {}),
            },
          };
          const updatedTracks = tracks.map((t) =>
            t.id === track.id ? { ...t, clips: [...t.clips, newClip] } : t
          );
          onTracksChange(updatedTracks);
        } else if (dragData.type === "graphic-clip") {
          const newGraphic: GraphicTimelineClip = {
            id: `${dragData.clip.id}-${Date.now()}`,
            graphicId: dragData.clip.graphicId || dragData.clip.id,
            name: dragData.clip.name || "Graphic",
            startTime,
            duration: 3,
            endTime: startTime + 3,
            type: dragData.clip.type || "shape",
            icon: dragData.clip.icon || "square",
            description: dragData.clip.description || "Graphic element",
            color: dragData.clip.color || "#000000",
            content: dragData.clip.content,
            x: 50,
            y: 50,
            width: 150,
            height: 150,
            // ✅ preserve character set metadata
            meta: {
              ...(dragData.clip?.meta || dragData.meta || {}),
              ...(sourceSetLabel ? { characterSet: sourceSetLabel } : {}),
            },
          };
          const updatedTracks = tracks.map((t) =>
            t.id === track.id ? { ...t, clips: [...t.clips, newGraphic] } : t
          );
          onTracksChange(updatedTracks);
        }
      } catch (err) {
        console.error("Failed to parse drop data:", err);
      }
    },
    [tracks, onTracksChange, timeScale]
  );

  // empty row drop to create first normal track
  const onDragOverEmpty = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = Math.max(0, x / timeScale);
      setEmptyHover(true);
      setEmptyHoverTime(t);
    },
    [timeScale]
  );

  const onDragLeaveEmpty = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const current = e.currentTarget as HTMLDivElement;
    if (!current.contains(e.relatedTarget as Node)) {
      setEmptyHover(false);
      setEmptyHoverTime(null);
    }
  }, []);

  const onDropOnEmpty = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setEmptyHover(false);
      setEmptyHoverTime(null);

      try {
        const raw =
          e.dataTransfer.getData("application/x-clip") ||
          e.dataTransfer.getData("application/json") ||
          "";
        const dragData = raw ? JSON.parse(raw) : {};
        const sourceSetLabel = resolveSourceSetLabel(dragData);

        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const startTime = Math.max(0, x / timeScale);

        const newTrack: Track = {
          id: `track-${Date.now()}`,
          name: `Track 1`,
          clips: [],
        };

        const pushAnimation = () => {
          const duration = dragData.duration || 3;
          newTrack.clips.push({
            id: `${dragData.id}-${Date.now()}`,
            animationId: dragData.animationId || dragData.id,
            name: dragData.name || "Action",
            startTime,
            duration,
            endTime: startTime + duration,
            type: dragData.type || "fade",
            icon: dragData.icon || "zap",
            description: dragData.description || "Animation clip",
            x: 50,
            y: 50,
            width: 200,
            height: 150,
            meta: {
              ...(dragData.clip?.meta || dragData.meta || {}),
              ...(sourceSetLabel ? { characterSet: sourceSetLabel } : {}),
            },
          } as TimelineClip);
        };

        const pushGraphic = () => {
          newTrack.clips.push({
            id: `${dragData.clip.id}-${Date.now()}`,
            graphicId: dragData.clip.graphicId || dragData.clip.id,
            name: dragData.clip.name || "Graphic",
            startTime,
            duration: 3,
            endTime: startTime + 3,
            type: dragData.clip.type || "shape",
            icon: dragData.clip.icon || "square",
            description: dragData.clip.description || "Graphic element",
            color: dragData.clip.color || "#000000",
            content: dragData.clip.content,
            x: 50,
            y: 50,
            width: 150,
            height: 150,
            meta: {
              ...(dragData.clip?.meta || dragData.meta || {}),
              ...(sourceSetLabel ? { characterSet: sourceSetLabel } : {}),
            },
          } as GraphicTimelineClip);
        };

        if (
          dragData.animationId ||
          (dragData.id && dragData.duration && dragData.type && !dragData.clip)
        )
          pushAnimation();
        else if (dragData.type === "graphic-clip") pushGraphic();
        else return;

        onTracksChange([newTrack]);
      } catch (err) {
        console.error("Failed to parse drop data:", err);
      }
    },
    [onTracksChange, timeScale]
  );

  // “Drop here to create another track” zone
  const onDragOverNewTrackZone = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);
  const onDropOnNewTrackZone = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      try {
        const raw =
          e.dataTransfer.getData("application/x-clip") ||
          e.dataTransfer.getData("application/json") ||
          "";
        const dragData = raw ? JSON.parse(raw) : {};
        const sourceSetLabel = resolveSourceSetLabel(dragData);

        const startTime = 0;
        const newTrack: Track = {
          id: `track-${Date.now()}`,
          name: `Track ${tracks.length + 1}`,
          clips: [],
        };

        const pushAnimation = () => {
          const duration = dragData.duration || 3;
          newTrack.clips.push({
            id: `${dragData.id}-${Date.now()}`,
            animationId: dragData.animationId || dragData.id,
            name: dragData.name || "Action",
            startTime,
            duration,
            endTime: startTime + duration,
            type: dragData.type || "fade",
            icon: dragData.icon || "zap",
            description: dragData.description || "Animation clip",
            x: 50,
            y: 50,
            width: 200,
            height: 150,
            meta: {
              ...(dragData.clip?.meta || dragData.meta || {}),
              ...(sourceSetLabel ? { characterSet: sourceSetLabel } : {}),
            },
          } as TimelineClip);
        };

        const pushGraphic = () => {
          newTrack.clips.push({
            id: `${dragData.clip.id}-${Date.now()}`,
            graphicId: dragData.clip.graphicId || dragData.clip.id,
            name: dragData.clip.name || "Graphic",
            startTime,
            duration: 3,
            endTime: startTime + 3,
            type: dragData.clip.type || "shape",
            icon: dragData.clip.icon || "square",
            description: dragData.clip.description || "Graphic element",
            color: dragData.clip.color || "#000000",
            content: dragData.clip.content,
            x: 50,
            y: 50,
            width: 150,
            height: 150,
            meta: {
              ...(dragData.clip?.meta || dragData.meta || {}),
              ...(sourceSetLabel ? { characterSet: sourceSetLabel } : {}),
            },
          } as GraphicTimelineClip);
        };

        if (
          dragData.animationId ||
          (dragData.id && dragData.duration && dragData.type && !dragData.clip)
        )
          pushAnimation();
        else if (dragData.type === "graphic-clip") pushGraphic();
        else {
          // Not a clip payload? Just add an empty track.
          onTracksChange([...tracks, newTrack]);
          return;
        }

        onTracksChange([...tracks, newTrack]);
      } catch (err) {
        console.error("Failed to parse drop data:", err);
      }
    },
    [tracks, onTracksChange]
  );

  // time markers
  const timeMarkers = [];
  for (let time = 0; time <= maxTime; time += 0.25) {
    timeMarkers.push({
      time,
      isMajor: time % 1 === 0,
      isMinor: time % 0.5 === 0 && time % 1 !== 0,
    });
  }

  // Put near top:
const TRANSITION_PRESETS = [
  { label: "None", type: "none", dur: 0.0 },
  { label: "Fade (sm)", type: "fade-sm", dur: 0.2 },
  { label: "Fade (md)", type: "fade-md", dur: 0.35 },
  { label: "Fade (lg)", type: "fade-lg", dur: 0.6 },
  { label: "Scale In", type: "scale-in-center", dur: 0.4 },
  { label: "Slide In Left", type: "slide-in-left", dur: 0.4 },
  { label: "Slide In Right", type: "slide-in-right", dur: 0.4 },
];

function TransitionPicker({
  clip,
  which, // "in" | "out"
  setGraphics,
}: {
  clip: GraphicTimelineClip;
  which: "in" | "out";
  setGraphics: (updater: any) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute -bottom-3 right-1">
      <button
        type="button"
        className="text-xs rounded px-1 py-0.5 bg-white/80 hover:bg-white shadow"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title={`Set ${which} transition`}
      >
        {which === "in" ? "⟡in" : "⟡out"}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-40 rounded border bg-white p-1 shadow">
          {TRANSITION_PRESETS.map((p) => (
            <button
              key={p.label}
              className="block w-full text-left text-xs px-2 py-1 hover:bg-gray-100 rounded"
              onClick={() => {
                setGraphics((prev: GraphicTimelineClip[]) =>
                  prev.map((g) =>
                    g.id === clip.id
                      ? {
                          ...g,
                          transitions: {
                            ...(g.transitions || {}),
                            [which]:
                              p.type === "none"
                                ? undefined
                                : { type: p.type as any, duration: p.dur, easing: "ease" },
                          },
                        }
                      : g
                  )
                );
                setOpen(false);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

  return (
    <div className="flex-1 bg-timeline-bg">
      {/* Controls */}
      <div className="flex flex-wrap justify-start items-center gap-2 sm:gap-3 p-2 sm:p-4 bg-card border-b border-border">
        <div className="flex justify-items-evenly">
          {/* Transport Controls */}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleSkipBack}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onPlayToggle}>
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSkipForward}>
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>   
          {/* Divider */}
          <div className="h-4 w-px bg-border" />   
          {/* Snapping */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={snappingIncrement !== null ? "default" : "ghost"}
                size="sm"
                className={`flex items-center gap-1 ${
                  snappingIncrement !== null ? "text-primary-foreground" : ""
                }`}
              >
                <Magnet className="w-4 h-4" />
                <span className="text-xs">{currentSnappingLabel}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-24">
              {snappingOptions.map((option) => (
                <DropdownMenuItem
                  key={option.label}
                  onClick={() => setSnappingIncrement(option.value)}
                  className={`text-xs ${
                    snappingIncrement === option.value ? "bg-accent" : ""
                  }`}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Divider */}
          <div className="h-4 w-px bg-border" />
          {/* Zoom */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={currentZoomIndex === 0}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <div className="text-xs text-muted-foreground font-mono px-2 min-w-[48px] text-center">
              {((timeScale / 40) * 100).toFixed(0)}%
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={currentZoomIndex === zoomLevels.length - 1}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-4">
          {/* Timeline Duration */}
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Duration:</span>
            <Input
              type="number"
              max="300"
              step="1"
              value={timelineDurationDraft}
              onChange={(e) => {
                const { value } = e.target;
                setTimelineDurationDraft(value);
                const next = parseInt(value, 10);
                if (!Number.isNaN(next)) {
                  setTimelineDuration(next);
                }
              }}
              className="w-14 sm:w-16 h-7 text-xs"
            />
            <span className="text-xs text-muted-foreground">s</span>
          </div>
          {/* Timecode */}  
          <div className="text-sm font-mono text-muted-foreground select-none">
            {currentTime.toFixed(2)}s / {maxTime.toFixed(2)}s
          </div>
        </div>
        {/* Add Track Elements Button */}
        <div className="w-auto sm:w-auto flex items-center gap-1 sm:gap-2 mt-2 sm:mt-0">
          {/*Always-visible Add Track button */}
          <Button size="sm" onClick={handleAddTrack} className="gap-1">
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline">Add Track</span>
          </Button>

          <AddBackgroundDialog onAddBackground={handleBackgroundAdd} />
          <AudioImportDialog onAddAudioTrack={handleAudioTrackAdd} />
        </div>
      </div>

      {/* Timeline */}
      <div className="relative overflow-x-auto">
        {/* Header row */}
        <div
          className="relative bg-timeline-track cursor-crosshair"
          onMouseDown={handleTimelineMouseDown}
          style={{ width: `${maxTime * timeScale + 80}px`, minWidth: "100%" }}
        >
          <div
            className="flex items-center h-16 border-b border-timeline-grid"
            style={{ paddingBottom: "8px" }}
          >
            <div className="w-20 h-full bg-muted/50 border-r border-border flex items-center justify-center">
              <span className="text-xs font-medium text-muted-foreground">Time</span>
            </div>
            <div className="relative flex-1">
              {timeMarkers.map((marker, i) => (
                <div
                  key={i}
                  className="absolute flex flex-col items-center pointer-events-none"
                  style={{
                    left: `${marker.time * timeScale}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div
                    className={`w-px bg-timeline-grid ${
                      marker.isMajor ? "h-4" : marker.isMinor ? "h-3" : "h-2"
                    }`}
                  />
                  {marker.isMajor && (
                    <span className="text-xs text-muted-foreground mt-1 font-mono select-none whitespace-nowrap px-1">
                      {marker.time}s
                    </span>
                  )}
                </div>
              ))}
              <div
                className={`absolute top-0 w-0.5 h-full bg-timeline-playhead shadow-sm z-20 ${
                  isDraggingPlayhead ? "shadow-lg" : ""
                }`}
                style={{ left: `${currentTime * timeScale}px` }}
              >
                <div
                  className={`absolute -top-1 -left-2 w-4 h-4 bg-timeline-playhead rounded-full shadow-md cursor-grab active:cursor-grabbing transition-all ${
                    isDraggingPlayhead ? "scale-110 shadow-lg" : "hover:scale-105"
                  }`}
                  onMouseDown={handlePlayheadMouseDown}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tracks container */}
        {/* Playhead line */}
        <div
          ref={timelineRef}
          className="relative transition-colors duration-200"
          style={{ width: `${maxTime * timeScale + 80}px`, minWidth: "100%" }}
        >
          <div className="relative">
            {/* Global playhead line overlay (covers all track rows). */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-timeline-playhead/70 z-30 pointer-events-none"
              style={{ left: `${80 + currentTime * timeScale}px` }}
            />

            {/* Empty state for regular tracks */}
            {tracks.length === 0 && (
              <div className="relative bg-timeline-track h-32 border-b border-border">
                <div className="absolute left-0 top-0 w-20 h-full bg-muted/50 border-r border-border flex flex-col items-center justify-center">
                  <Button
                    onClick={handleAddTrack}
                    variant="ghost"
                    size="sm"
                    className="w-8 h-8 p-0 rounded-full hover:bg-primary/10"
                    title="Add Track"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div
                  className={`ml-20 relative h-full ${
                    emptyHover ? "ring-2 ring-primary/40 bg-primary/5" : ""
                  }`}
                  onDragOver={onDragOverEmpty}
                  onDragLeave={onDragLeaveEmpty}
                  onDrop={onDropOnEmpty}
                >
                  {timeMarkers.map((marker, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 w-px h-full pointer-events-none ${
                        marker.isMajor
                          ? "bg-timeline-grid/40"
                          : marker.isMinor
                          ? "bg-timeline-grid/25"
                          : "bg-timeline-grid/15"
                      }`}
                      style={{
                        left: `${marker.time * timeScale}px`,
                        transform: "translateX(-50%)",
                      }}
                    />
                  ))}
                  {emptyHover && emptyHoverTime != null && (
                    <div className="absolute inset-0 pointer-events-none z-20">
                      <div className="absolute inset-0 border-2 border-dashed border-primary/50 rounded-md" />
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-primary/70 shadow-sm"
                        style={{ left: `${emptyHoverTime * timeScale}px` }}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-center h-full text-muted-foreground/60">
                    Drop clips here to create tracks
                  </div>
                </div>
              </div>
            )}

            {/* Regular tracks */}
            {tracks.map((track) => {
              const trackHeight = 112;
              const isHoveringThis = hoverTrackId === track.id;
              const hoverX = hoverTime != null ? hoverTime * timeScale : null;
              const isReorderHover = dragOverTrackId === track.id;
              const isBeingDragged = draggingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className={`relative bg-timeline-track border-b border-border transition-colors ${
                    isReorderHover ? "ring-2 ring-primary/40" : ""
                  }`}
                  style={{ height: `${trackHeight}px` }}
                  onDragOver={(e) => handleTrackDragOver(e, track.id)}
                  onDrop={(e) => handleTrackDrop(e, track.id)}
                  onDragEnd={handleTrackDragEnd}
                >
                  {/* left column */}
                  <div className="absolute left-0 top-0 w-20 h-full bg-muted/50 border-r border-border flex flex-col items-center justify-center gap-1 group">
                    <button
                      title="Drag to reorder"
                      draggable
                      onDragStart={(e) => handleTrackDragStart(e, track.id)}
                      onDragEnd={handleTrackDragEnd}
                      className={`p-1 rounded hover:bg-muted transition-colors cursor-grab active:cursor-grabbing ${
                        isBeingDragged ? "opacity-60" : ""
                      }`}
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                    </button>

                    {editingTrackId === track.id ? (
                      <div className="flex flex-col items-center gap-1 px-1">
                        <Input
                          autoFocus
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="h-6 text-xs px-2 py-0 w-[72px]"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={commitRename}
                            title="Save"
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={cancelRename}
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          className="text-xs font-medium text-foreground text-center px-1 mb-1 truncate max-w-[72px]"
                          title="Double-click to rename"
                          onDoubleClick={() => beginRename(track.id, track.name || "")}
                        >
                          {track.name}
                        </button>
                        <Button
                          onClick={() => handleDeleteTrack(track.id)}
                          variant="ghost"
                          size="sm"
                          className="w-6 h-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                          title="Delete Track"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>

                  {/* content */}
                  <div
                    className={`ml-20 relative h-full ${
                      isHoveringThis ? "ring-2 ring-primary/40 bg-primary/5" : ""
                    }`}
                    onDragOver={(e) => onDragOverTrack(e, track.id)}
                    onDragLeave={(e) => onDragLeaveTrack(e, track.id)}
                    onDrop={(e) => onDropOnTrack(e, track)}
                  >
                    {timeMarkers.map((marker, i) => (
                      <div
                        key={i}
                        className={`absolute top-0 w-px h-full pointer-events-none ${
                          marker.isMajor
                            ? "bg-timeline-grid/40"
                            : marker.isMinor
                            ? "bg-timeline-grid/25"
                            : "bg-timeline-grid/15"
                        }`}
                        style={{
                          left: `${marker.time * timeScale}px`,
                          transform: "translateX(-50%)",
                        }}
                      />
                    ))}

                    {isHoveringThis && hoverX != null && (
                      <div className="absolute inset-0 pointer-events-none z-20">
                        <div className="absolute inset-0 border-2 border-dashed border-primary/50 rounded-md" />
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-primary/70 shadow-sm"
                          style={{ left: `${hoverX}px` }}
                        />
                      </div>
                    )}

                    {/* Clips */}
                    {track.clips.map((clip) => {
                      if ("animationId" in clip) {
                        return (
                          <TimelineClipComponent
                            key={clip.id}
                            clip={clip}
                            timeScale={timeScale}
                            onUpdate={(clipId, updates) => {
                              const updatedTracks = tracks.map((t) =>
                                t.id === track.id
                                  ? {
                                      ...t,
                                      clips: t.clips.map((c) =>
                                        c.id === clipId ? { ...c, ...updates } : c
                                      ),
                                    }
                                  : t
                              ) as Track[];
                              onTracksChange(updatedTracks);
                            }}
                            onDelete={(clipId) => {
                              const updatedTracks = tracks.map((t) =>
                                t.id === track.id
                                  ? {
                                      ...t,
                                      clips: t.clips.filter((c) => c.id !== clipId),
                                    }
                                  : t
                              );
                              onTracksChange(updatedTracks);
                            }}
                            isDragging={draggedClipId === clip.id}
                            onDragStart={() => setDraggedClipId(clip.id)}
                            onDragEnd={() => setDraggedClipId(null)}
                            snappingIncrement={snappingIncrement}
                            customThumbnail={(() => {
                              const lsThumbs = JSON.parse(
                                localStorage.getItem("customThumbnails") || "{}"
                              );
                              const lookupId =
                                clip.animationId || clip.id.replace(/-\d+$/, "");
                              return (
                                customThumbnails?.[lookupId] ||
                                customThumbnails?.[clip.id] ||
                                lsThumbs[lookupId] ||
                                lsThumbs[clip.id]
                              );
                            })()}
                          />
                        );
                      } else if ("graphicId" in clip) {
                        return (
                          <GraphicTrackComponent
                            key={clip.id}
                            clip={clip}
                            timeScale={timeScale}
                            isDragging={draggedClipId === clip.id}
                            onDragStart={() => setDraggedClipId(clip.id)}
                            onDragEnd={() => setDraggedClipId(null)}
                            snappingIncrement={snappingIncrement}
                            onUpdate={(id, updates) => {
                            const updatedTracks = tracks.map((t) => ({
                                ...t,
                                clips: t.clips.map((c) =>
                                  c.id === id && "graphicId" in c
                                    ? ({ ...c, ...updates } as GraphicTimelineClip)
                                    : c
                                ),
                              }));
                              onTracksChange(updatedTracks);
                            }}
                            onDelete={(id) => {
                              const updatedTracks = tracks.map((t) => ({
                                ...t,
                                clips: t.clips.filter((c) => c.id !== id),
                              }));
                              onTracksChange(updatedTracks);
                            }}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              );
            })}

            {/* NEW: Drop zone to create an additional track */}
            <div
              className="relative h-12 bg-muted/20 border-b border-border flex items-center justify-center text-xs text-muted-foreground"
              onDragOver={onDragOverNewTrackZone}
              onDrop={onDropOnNewTrackZone}
              title="Drop a clip here to create a new track"
            >
              Drop here to add a new track
            </div>

            {/* Background tracks moved to the bottom so they appear last */}
            {(backgroundTracks || []).map((bg) => {
              const isReorderHover = dragOverBgId === bg.id;
              const isBeingDragged = draggingBgId === bg.id;
              return (
              <div
                key={bg.id}
                className={`relative bg-timeline-track border-b border-border transition-colors ${
                  isReorderHover ? "ring-2 ring-primary/40" : ""
                }`}
                style={{ height: "112px" }}
                onDragOver={(e) => handleBgDragOver(e, bg.id)}
                onDrop={(e) => handleBgDrop(e, bg.id)}
                onDragEnd={handleBgDragEnd}
              >
                <div className="absolute left-0 top-0 w-20 h-full bg-muted/50 border-r border-border flex flex-col items-center justify-center gap-1">
                    {/* drag handle for background row reorder */}
                  <button
                    title="Drag to reorder background"
                    draggable
                    onDragStart={(e) => handleBgDragStart(e, bg.id)}
                    onDragEnd={handleBgDragEnd}
                    className={`p-1 rounded hover:bg-muted transition-colors cursor-grab active:cursor-grabbing ${
                      isBeingDragged ? "opacity-60" : ""
                    }`}
                  >
                    {/* reuse GripVertical from existing imports */}
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <div className="text-[10px] font-medium text-muted-foreground text-center px-1 truncate max-w-[72px]">
                    {bg.name || "Background"}
                  </div>
                  <Button
                    onClick={() => handleBackgroundDelete(bg.id)}
                    variant="ghost"
                    size="sm"
                    className="w-6 h-6 p-0 hover:bg-destructive/20 hover:text-destructive transition-all"
                    title="Delete Background"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                <div className="ml-20 relative h-full">
                  {timeMarkers.map((marker, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 w-px h-full pointer-events-none ${
                        marker.isMajor
                          ? "bg-timeline-grid/40"
                          : marker.isMinor
                          ? "bg-timeline-grid/25"
                          : "bg-timeline-grid/15"
                      }`}
                      style={{
                        left: `${marker.time * timeScale}px`,
                        transform: "translateX(-50%)",
                      }}
                    />
                  ))}

                  <BackgroundTrackComponent
                    track={bg}
                    timeScale={timeScale}
                    onUpdate={handleBackgroundUpdate}
                    onDelete={handleBackgroundDelete}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                    snappingIncrement={snappingIncrement}
                  />
                </div>
              </div>
            )})}
            {/* Audio tracks (bottom-most) */}
            {(audioTracks || []).map((aTrack) => (
              <div
                key={aTrack.id}
                className="relative bg-timeline-track border-b border-border"
                style={{ height: "80px" }}
              >
                {/* left label column */}
                <div className="absolute left-0 top-0 w-20 h-full bg-muted/50 border-r border-border flex flex-col items-center justify-center gap-1">
                  <div className="text-[10px] font-medium text-muted-foreground text-center px-1 truncate max-w-[72px]">
                    {aTrack.name || "Audio"}
                  </div>
                  {/* delete sits on the clip itself, so no button here (optional) */}
                  <Button
                    onClick={() => handleAudioDelete(aTrack.id)}
                    variant="ghost"
                    size="sm"
                    className="w-6 h-6 p-0 hover:bg-destructive/20 hover:text-destructive transition-all"
                    title="Delete Background"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                {/* grid + clip area */}
                <div className="ml-20 relative h-full">
                  {timeMarkers.map((marker, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 w-px h-full pointer-events-none ${
                        marker.isMajor
                          ? "bg-timeline-grid/40"
                          : marker.isMinor
                          ? "bg-timeline-grid/25"
                          : "bg-timeline-grid/15"
                      }`}
                      style={{
                        left: `${marker.time * timeScale}px`,
                        transform: "translateX(-50%)",
                      }}
                    />
                  ))}

                  <AudioTrackComponent
                    track={aTrack}
                    timeScale={timeScale}
                    onUpdate={handleAudioUpdate}
                    onDelete={handleAudioDelete}
                    isDragging={draggedAudioId === aTrack.id}
                    onDragStart={(id) => setDraggedAudioId(id)}
                    onDragEnd={() => setDraggedAudioId(null)}
                    snappingIncrement={snappingIncrement}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
