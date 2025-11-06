import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, GripVertical } from "lucide-react";
import { TimelineClipComponent } from "@/components/TimelineClipComponent";
import { TimelineClip, GraphicTimelineClip } from "@/types/storyboard";

export interface Track {
  id: string;
  name: string;
  clips: (TimelineClip | GraphicTimelineClip)[];
  color?: string;
}

interface TimelineTrackProps {
  track: Track;
  currentTime: number;
  onTrackUpdate: (updatedTrack: Track) => void;
  onTrackDelete: (trackId: string) => void;
  onClipDelete: (trackId: string, clipId: string) => void;
  customThumbnails: Record<string, string>;
  onThumbnailsChange: (thumbnails: Record<string, string>) => void;
}

export function TimelineTrack({
  track,
  currentTime,
  onTrackUpdate,
  onTrackDelete,
  onClipDelete,
  customThumbnails,
  onThumbnailsChange
}: TimelineTrackProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(track.name);

  const handleNameSave = useCallback(() => {
    if (editName.trim() && editName.trim() !== track.name) {
      onTrackUpdate({
        ...track,
        name: editName.trim()
      });
    }
    setIsEditing(false);
    setEditName(track.name);
  }, [editName, track, onTrackUpdate]);

  const handleNameCancel = useCallback(() => {
    setEditName(track.name);
    setIsEditing(false);
  }, [track.name]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const dragData = JSON.parse(data);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startTime = Math.max(0, (x / rect.width) * 60); // Assuming 60 second timeline

      if (dragData.type === 'animation-clip') {
        const duration = Number(dragData.clip.duration) || 3.0;
        const s = Math.round(startTime * 10) / 10;
        const newClip: TimelineClip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          animationId: dragData.clip.id,
          name: dragData.clip.name,
          startTime: s,
          duration,
          endTime: s + duration,             // <-- critical
          type: dragData.clip.type,
          icon: dragData.clip.icon,
          description: dragData.clip.description
        };


        onTrackUpdate({
          ...track,
          clips: [...track.clips, newClip]
        });
      } else if (dragData.type === 'graphic-clip') {
        const newGraphicClip: GraphicTimelineClip = {
          id: `graphic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          graphicId: dragData.clip.id,
          name: dragData.clip.name,
          startTime: Math.round(startTime * 10) / 10,
          duration: 3.0, // Default duration for graphics
          type: dragData.clip.type,
          icon: dragData.clip.icon,
          description: dragData.clip.description,
          color: dragData.clip.color,
          ...(dragData.clip.content && { content: dragData.clip.content })
        };

        onTrackUpdate({
          ...track,
          clips: [...track.clips, newGraphicClip]
        });
      }
    } catch (error) {
      console.error('Error processing drop:', error);
    }
  }, [track, onTrackUpdate]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClipUpdate = useCallback((updatedClip: TimelineClip | GraphicTimelineClip) => {
    const updatedClips = track.clips.map(clip =>
      clip.id === updatedClip.id ? updatedClip : clip
    );
    
    onTrackUpdate({
      ...track,
      clips: updatedClips
    });
  }, [track, onTrackUpdate]);

  const handleClipRemove = useCallback((clipId: string) => {
    onClipDelete(track.id, clipId);
  }, [track.id, onClipDelete]);

  return (
    <Card className="mb-2 bg-card border-border">
      <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/30">
        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
        
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') handleNameCancel();
              }}
              className="px-2 py-1 text-sm bg-background border border-border rounded flex-1"
              autoFocus
            />
            <Button size="sm" variant="outline" onClick={handleNameSave}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={handleNameCancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <div 
            className="flex-1 text-sm font-medium text-foreground cursor-pointer hover:text-primary"
            onClick={() => setIsEditing(true)}
          >
            {track.name}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          {track.clips.length} clips
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => onTrackDelete(track.id)}
          className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      <div 
        className="relative h-16 bg-timeline-track border-r border-timeline-grid overflow-hidden"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {/* Timeline grid */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 60 }, (_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-timeline-grid/30"
              style={{ minWidth: '1px' }}
            />
          ))}
        </div>

        {/* Current time indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-timeline-playhead z-30 pointer-events-none"
          style={{
            left: `${(currentTime / 60) * 100}%`,
            boxShadow: '0 0 8px hsl(var(--timeline-playhead))'
          }}
        />

        {/* Clips */}
        {track.clips.map((clip) => {
          // Handle TimelineClip (animation clips)
          if ('animationId' in clip) {
            return (
              <TimelineClipComponent
                key={clip.id}
                clip={clip as TimelineClip}
                timeScale={1}
                onUpdate={(clipId, updates) => {
                  const updatedClip = { ...clip, ...updates };
                  handleClipUpdate(updatedClip);
                }}
                onDelete={handleClipRemove}
                isDragging={false}
                onDragStart={() => {}}
                onDragEnd={() => {}}
                snappingIncrement={null}
                customThumbnail={customThumbnails[clip.animationId] || ''}
              />
            );
          }
          
          // Handle GraphicTimelineClip - render as a simple graphic clip
          return (
            <div
              key={clip.id}
              className="absolute top-1 bg-yellow-500/80 hover:bg-yellow-500 border border-yellow-600 rounded cursor-move transition-colors"
              style={{
                left: `${(clip.startTime / 60) * 100}%`,
                width: `${(clip.duration / 60) * 100}%`,
                height: '56px',
                minWidth: '40px'
              }}
              onClick={() => handleClipRemove(clip.id)}
            >
              <div className="flex items-center justify-center h-full px-2 text-white text-sm font-medium truncate">
                <span className="mr-1">{clip.icon}</span>
                {clip.name}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}