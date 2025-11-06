import { useRef, useState } from "react";
import { AnimationClip } from "@/types/storyboard";
import { cn } from "@/lib/utils";
import { Upload, X, Video, Image, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { toast } from "sonner";

interface AnimationClipCardProps {
  clip: AnimationClip;
  className?: string;
  customThumbnail?: string;
  onThumbnailUpdate?: (clipId: string, imageUrl: string) => void;
  onThumbnailRemove?: (clipId: string) => void;
  onClipRemove?: (clipId: string) => void;
  onClipUpdate?: (clipId: string, updatedClip: AnimationClip) => void;
}

const getClipGradient = (type: AnimationClip['type']) => {
  const gradients = {
    fade: 'bg-clip-fade',
    slide: 'bg-clip-slide', 
    zoom: 'bg-clip-zoom',
    rotate: 'bg-clip-rotate',
    bounce: 'bg-clip-bounce',
    elastic: 'bg-clip-elastic'
  };
  return gradients[type];
};

// Action clips that should use image placeholders
const actionClipIds = ['walk-cycle', 'jump-action', 'wave-gesture', 'run-cycle', 'idle-breath', 'spin-dance'];

const getClipThumbnail = (
  clip: AnimationClip, 
  customThumbnail?: string,
  baseClipId?: string
) => {
  // All clips in the Actions category should use custom images
  const isActionClip = true; // Since this is only called for action clips
  
  if (customThumbnail) {

    // Show custom uploaded image
    return (
      <img 
        src={customThumbnail} 
        alt={clip.name}
        className="w-full h-full object-cover rounded-md"
      />
    );
  }
  
  // If no custom thumbnail, show upload prompt placeholder

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-md border-2 border-dashed border-gray-300">
      <div className="text-2xl mb-1">📸</div>
      <div className="text-xs text-gray-600 text-center px-2 leading-tight">Upload Image</div>
    </div>
  );
};

export function AnimationClipCard({ 
  clip, 
  className, 
  customThumbnail, 
  onThumbnailUpdate, 
  onThumbnailRemove, 
  onClipRemove,
  onClipUpdate
}: AnimationClipCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract base clip ID for consistent thumbnail lookup
  const baseClipId = clip.id.replace(/-\d+$/, '');


  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify(clip));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onThumbnailUpdate) return;

    try {
      // Convert file to base64 data URL instead of blob URL to persist across refreshes
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageUrl = event.target?.result as string;
        // Use full clip ID for custom clips, base ID for built-in clips
        const updateId = clip.id.startsWith('custom-') ? clip.id : baseClipId;
        await onThumbnailUpdate(updateId, imageUrl);
        toast.success("Thumbnail updated successfully!");
      };
      reader.onerror = () => {
        console.error('Error reading file');
        toast.error("Failed to upload image");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error("Failed to upload image");
    }
  };


  const handleRemoveThumbnail = () => {
    if (onThumbnailRemove) {
      // Use full clip ID for custom clips, base ID for built-in clips
      const removeId = clip.id.startsWith('custom-') ? clip.id : baseClipId;
      onThumbnailRemove(removeId);
      toast.success("Thumbnail removed successfully!");
    }
  };


  const isActionClip = true; // All clips in Actions category use custom images

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={cn(
        "group relative p-2 rounded-lg border border-border cursor-grab active:cursor-grabbing",
        "hover:border-primary/50 transition-all duration-200 hover:shadow-clip",
        "hover:scale-[1.02] hover:-translate-y-0.5",
        "h-full flex flex-col",
        getClipGradient(clip.type),
        className
      )}
    >
      {/* Hidden file inputs */}
      {isActionClip && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}

      {/* Thumbnail Area - Square aspect ratio for action clips */}
      <div className={cn(
        "relative mb-2 rounded-md overflow-hidden bg-black/10",
        isActionClip ? "aspect-square w-full" : "flex-1"
      )}>
        {getClipThumbnail(clip, customThumbnail, baseClipId)}
        
        {/* Upload button for action clips - positioned in top left */}
        {isActionClip && (
          <div className="absolute top-2 left-2 z-20">
            <div className="relative group/upload">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-all duration-200 backdrop-blur-sm border border-white/20"
                title="Upload media"
              >
                <Upload className="w-3.5 h-3.5 text-white" />
              </button>
              
              {/* Direct upload button - click to upload image */}
              <div 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleImageUpload();
                }}
                className="absolute top-6 left-0 pt-2 opacity-0 group-hover/upload:opacity-100 transition-opacity duration-200 pointer-events-none group-hover/upload:pointer-events-auto z-50 cursor-pointer"
              >
                <div className="bg-gray-900/95 backdrop-blur-sm rounded-md border border-white/20 py-1 min-w-max shadow-lg">
                  <div className="flex items-center gap-2 px-3 py-2 text-white text-xs hover:bg-white/10 transition-colors">
                    <Image className="w-3 h-3" />
                    Upload Image
                  </div>
                  {customThumbnail && (
                    <>
                      <div className="border-t border-white/30 my-1"></div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRemoveThumbnail();
                          }}
                          className="flex items-center gap-2 px-3 py-2 text-red-400 text-xs hover:bg-red-500/10 w-full text-left transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Remove Image
                        </button>
                      </>
                    )}
                  </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Remove clip button for all action clips */}
        {isActionClip && onClipRemove && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClipRemove(clip.id);
            }}
            className="absolute top-2 right-2 w-6 h-6 bg-red-600/80 hover:bg-red-600 rounded-full flex items-center justify-center transition-all duration-200 z-20 opacity-0 group-hover:opacity-100 group-focus:opacity-100"
            title="Remove clip from library"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        )}
        
        {/* Drag indicator overlay (for non-action clips) */}
        {!isActionClip && (
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex flex-col gap-0.5">
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
            </div>
          </div>
        )}
      </div>

      {/* Content - Compact footer */}
      <div className="space-y-0.5">
        <h3 className="font-medium text-white text-shadow-sm text-xs leading-tight line-clamp-1">
          {clip.name}
        </h3>
        <p className="text-xs text-white/80">
          {clip.duration}s
        </p>
      </div>
    </div>
  );
}