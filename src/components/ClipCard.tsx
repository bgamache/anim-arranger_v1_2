import { useRef } from "react";
import type { AnimationClip, GraphicClip } from "@/types/storyboard";
import { cn } from "@/lib/utils";
import { Upload, X, Image } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";

/** Which section this card is rendered in. */
export type ClipVariant = "action" | "graphic" | "text";

interface BaseProps {
  className?: string;
  customThumbnail?: string;
  onThumbnailUpdate?: (clipId: string, imageUrl: string) => void;
  onThumbnailRemove?: (clipId: string) => void;
  onClipRemove?: (clipId: string) => void;
}

interface ActionProps extends BaseProps {
  variant: "action";
  clip: AnimationClip;
  onClipUpdate?: (clipId: string, updatedClip: AnimationClip) => void;
}

interface GraphicProps extends BaseProps {
  variant: "graphic" | "text";
  clip: GraphicClip;
  onClipUpdate?: (clipId: string, updatedClip: GraphicClip) => void;
}

type ClipCardProps = ActionProps | GraphicProps;

const getClipGradient = (type: AnimationClip["type"]) => {
  const gradients: Record<string, string> = {
    fade: "bg-clip-fade",
    slide: "bg-clip-slide",
    zoom: "bg-clip-zoom",
    rotate: "bg-clip-rotate",
    bounce: "bg-clip-bounce",
    elastic: "bg-clip-elastic",
  };
  return gradients[type] ?? "";
};

export function ClipCard(props: ClipCardProps) {
  const { className, customThumbnail, onThumbnailUpdate, onThumbnailRemove, onClipRemove } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAction = props.variant === "action";
  const isText = props.variant === "text";

  // Normalized id behavior for Action built-ins (so thumbs share across instances)
  const clipId = isAction ? props.clip.id : (props.clip as GraphicClip).id;
  const baseClipId = isAction
    ? (props.clip as AnimationClip).id.replace(/-\d+$/, "")
    : clipId;

  const handleDragStart = (e: React.DragEvent) => {
    if (isAction) {
      // actions use raw clip payload (your Timeline expects this)
      e.dataTransfer.setData("application/json", JSON.stringify(props.clip));
    } else {
      // graphics/text wrap the payload so timeline picks the right branch
      e.dataTransfer.setData("application/json", JSON.stringify({ type: "graphic-clip", clip: props.clip }));
    }
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleImageUpload = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onThumbnailUpdate) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const imageUrl = ev.target?.result as string;
      // For built-in actions, use base id; for custom + graphics/text, use full id
      const idForThumb = isAction && !clipId.startsWith("custom-") ? baseClipId : clipId;
      onThumbnailUpdate(idForThumb, imageUrl);
    };
    reader.readAsDataURL(file);
  };

  const removeThumb = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onThumbnailRemove) return;
    const idForThumb = isAction && !clipId.startsWith("custom-") ? baseClipId : clipId;
    onThumbnailRemove(idForThumb);
  };

  const removeClip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClipRemove?.(clipId);
  };

  // Visuals
  const title = (props.clip as any).name as string;
  const duration = (props as ActionProps).variant === "action" ? (props.clip as AnimationClip).duration : undefined;
  const icon = !isAction ? (props.clip as GraphicClip).icon : undefined;
  const typeForGradient = isAction ? getClipGradient((props.clip as AnimationClip).type) : "";

  return (
        <div
      className={cn(
        "group relative rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors shadow-sm overflow-hidden",
        "cursor-grab active:cursor-grabbing",
        "w-full max-w-[156px] text-[12px] leading-tight",
        typeForGradient,
        className
      )}
      draggable
      onDragStart={handleDragStart}
    >
      <AspectRatio ratio={isAction ? 1 : 16 / 9} className="bg-muted/40">
        {customThumbnail ? (
          <img
            src={customThumbnail}
            alt={title}
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"            // ← helps during bulk updates
          />
        ) : isAction ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
            <div className="text-lg mb-0.5">📸</div>
            <div className="text-[11px] text-gray-600 text-center px-2 leading-tight">Upload Image</div>
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center select-none">
            <span className="text-3xl" role="img" aria-label={(props.clip as GraphicClip).type}>
              {icon}
            </span>
          </div>
        )}
      </AspectRatio>

      {/* Controls in the media corner (slightly smaller) */}
      <div className="absolute top-1.5 left-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleImageUpload();
          }}
          className="w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-sm border border-white/20"
          title="Upload image"
        >
          <Upload className="w-3 h-3 text-white" />
        </button>
      </div>

      {(customThumbnail || isAction) && (
        <button
          onClick={removeThumb}
          className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/80 hover:bg-white rounded-full flex items-center justify-center transition-all duration-200 z-10 opacity-0 group-hover:opacity-100"
          title="Remove thumbnail"
        >
          <Image className="w-3 h-3 text-gray-800" />
        </button>
      )}

      {onClipRemove && (
        <button
          onClick={removeClip}
          className="absolute bottom-1.5 right-1.5 w-5 h-5 bg-red-600/80 hover:bg-red-600 rounded-full flex items-center justify-center transition-all duration-200 z-10 opacity-0 group-hover:opacity-100"
          title="Remove from library"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}

      {/* Footer (tighter spacing & font sizes) */}
      <div className="p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{title}</div>
            <div className="text-[11px] text-muted-foreground capitalize truncate">
              {isAction ? "action" : isText ? "text" : (props.clip as GraphicClip).type}
            </div>
          </div>
          {isAction && typeof duration === "number" && (
            <div className="text-[11px] text-muted-foreground shrink-0">{duration}s</div>
          )}
        </div>
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
