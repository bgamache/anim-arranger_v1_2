import { useRef } from "react";
import { GraphicClip } from "@/types/storyboard";
import { cn } from "@/lib/utils";
import { Upload, X, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";

interface GraphicClipCardProps {
  clip: GraphicClip;
  className?: string;
  customThumbnail?: string;
  onThumbnailUpdate?: (clipId: string, imageUrl: string) => void;
  onThumbnailRemove?: (clipId: string) => void;
  onClipRemove?: (clipId: string) => void;
  onClipUpdate?: (clipId: string, updatedClip: GraphicClip) => void;
}

export function GraphicClipCard({
  clip,
  className,
  customThumbnail,
  onThumbnailUpdate,
  onThumbnailRemove,
  onClipRemove,
  onClipUpdate,
}: GraphicClipCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleDragStart = (e: React.DragEvent) => {
        // Wrap payload so Timeline's graphic branch picks it up
        e.dataTransfer.setData(
            "application/json",
            JSON.stringify({ type: "graphic-clip", clip })
        );
        e.dataTransfer.effectAllowed = "copy";
    };


  const handleImageUpload = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onThumbnailUpdate) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const imageUrl = ev.target?.result as string;
      onThumbnailUpdate(clip.id, imageUrl);
    };
    reader.readAsDataURL(file);
  };

  const removeThumb = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onThumbnailRemove?.(clip.id);
  };

  const removeClip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClipRemove?.(clip.id);
  };

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors shadow-sm overflow-hidden",
        className
      )}
      draggable
      onDragStart={handleDragStart}
    >
      <AspectRatio ratio={16 / 9} className="bg-muted/40">
        {customThumbnail ? (
          <img
            src={customThumbnail}
            alt={clip.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center select-none">
            <span className="text-5xl" role="img" aria-label={clip.type}>{clip.icon}</span>
          </div>
        )}
      </AspectRatio>

      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{clip.name}</div>
            <div className="text-xs text-muted-foreground capitalize truncate">{clip.type}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!customThumbnail ? (
              <Button size="icon" variant="ghost" onClick={handleImageUpload} title="Set thumbnail">
                <Upload className="h-4 w-4" />
                <span className="sr-only">Upload thumbnail</span>
              </Button>
            ) : (
              <Button size="icon" variant="ghost" onClick={removeThumb} title="Remove thumbnail">
                <Image className="h-4 w-4" />
                <span className="sr-only">Remove thumbnail</span>
              </Button>
            )}
            {onClipRemove && (
              <Button size="icon" variant="ghost" onClick={removeClip} title="Remove clip">
                <X className="h-4 w-4" />
                <span className="sr-only">Remove clip</span>
              </Button>
            )}
          </div>
        </div>
        {clip.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{clip.description}</p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
