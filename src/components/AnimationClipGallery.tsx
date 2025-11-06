import { useState, useEffect } from "react";
import { AnimationClip } from "@/types/storyboard";
import { AnimationClipCard } from "./AnimationClipCard";
import { AddActionDialog } from "./AddActionDialog";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ⬇️ Keep your existing categories; unchanged here for brevity
const animationCategories = [
   {
      title: "Actions",
      clips: [
        {
          id: 'walk-cycle',
          name: 'Walk Cycle',
          type: 'bounce' as const,
          duration: 2.0,
          icon: '🚶',
          description: 'Character walking animation loop'
        },
        {
          id: 'jump-action',
          name: 'Jump',
          type: 'elastic' as const,
          duration: 1.5,
          icon: '🤸',
          description: 'Character jumping with landing'
        },
        {
          id: 'wave-gesture',
          name: 'Wave',
          type: 'bounce' as const,
          duration: 2.5,
          icon: '👋',
          description: 'Character waving hand gesture'
        },
        {
          id: 'run-cycle',
          name: 'Run Cycle',
          type: 'bounce' as const,
          duration: 1.2,
          icon: '🏃',
          description: 'Fast character running animation'
        },
        {
          id: 'idle-breath',
          name: 'Idle Breathing',
          type: 'fade' as const,
          duration: 3.0,
          icon: '😌',
          description: 'Subtle character breathing idle animation'
        },
        {
          id: 'spin-dance',
          name: 'Spin Dance',
          type: 'rotate' as const,
          duration: 2.8,
          icon: '💃',
          description: 'Character spinning dance move'
        }
      ]
    }
];

interface AnimationClipGalleryProps {
  onThumbnailsChange?: (thumbnails: Record<string, string>) => void;
}

export function AnimationClipGallery({ onThumbnailsChange }: AnimationClipGalleryProps = {}) {
  // Default to all categories expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(animationCategories.map(cat => cat.title))
  );

  // Local (UI) state for thumbnails; store handles persistence
  const [customThumbnails, setCustomThumbnails] = useState<Record<string, string>>({});
  // State for custom actions
  const [customActions, setCustomActions] = useState<AnimationClip[]>([]);
  // State for hidden built-in action clips
  const [hiddenActionClips, setHiddenActionClips] = useState<Set<string>>(new Set());
  // State for built-in clip updates (name, duration changes)
  const [builtInClipUpdates, setBuiltInClipUpdates] = useState<Record<string, Partial<AnimationClip>>>({});

  // Load custom actions and thumbnails ONCE (UI only). Store persists centrally.
  useEffect(() => {
    const savedActions = localStorage.getItem("customActions");
    if (savedActions) {
      try { setCustomActions(JSON.parse(savedActions)); } catch {}
    }

    const savedThumbnails = localStorage.getItem("customThumbnails");
    if (savedThumbnails) {
      try { setCustomThumbnails(JSON.parse(savedThumbnails)); } catch { localStorage.removeItem("customThumbnails"); }
    }

    const savedHiddenClips = localStorage.getItem("hiddenActionClips");
    if (savedHiddenClips) {
      try { setHiddenActionClips(new Set(JSON.parse(savedHiddenClips))); } catch {}
    }

    const savedBuiltInUpdates = localStorage.getItem("builtInClipUpdates");
    if (savedBuiltInUpdates) {
      try { setBuiltInClipUpdates(JSON.parse(savedBuiltInUpdates)); } catch {}
    }
  }, []);

  // Save UI-only bits
  useEffect(() => {
    try { localStorage.setItem("customActions", JSON.stringify(customActions)); } catch {}
  }, [customActions]);

  useEffect(() => {
    try { localStorage.setItem("hiddenActionClips", JSON.stringify([...hiddenActionClips])); } catch {}
  }, [hiddenActionClips]);

  useEffect(() => {
    try { localStorage.setItem("builtInClipUpdates", JSON.stringify(builtInClipUpdates)); } catch {}
  }, [builtInClipUpdates]);

  const toggleCategory = (categoryTitle: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(categoryTitle) ? next.delete(categoryTitle) : next.add(categoryTitle);
      return next;
    });
  };

  const compressImage = (imageUrl: string, maxWidth = 150, quality = 0.5): Promise<string> =>
    new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        try {
          const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageUrl;
    });

  const handleThumbnailUpdate = async (clipId: string, imageUrl: string) => {
    const storageId = clipId.startsWith("custom-") ? clipId : clipId.replace(/[-_]\d+$/, "");
    try {
      const compressed = await compressImage(imageUrl);
      const next = { ...customThumbnails, [storageId]: compressed };
      setCustomThumbnails(next);
      onThumbnailsChange?.(next); // notify parent ONLY on user action
    } catch (e) {
      console.error("Failed to compress thumbnail:", e);
    }
  };

  const handleThumbnailRemove = (clipId: string) => {
    const baseClipId = clipId.replace(/-\d+$/, "");
    const next = { ...customThumbnails };
    delete next[baseClipId];
    setCustomThumbnails(next);
    onThumbnailsChange?.(next);
  };

  const handleAddAction = (newAction: AnimationClip, thumbnail?: string) => {
    setCustomActions(prev => [...prev, newAction]);
    if (thumbnail) {
      const next = { ...customThumbnails, [newAction.id]: thumbnail };
      setCustomThumbnails(next);
      onThumbnailsChange?.(next);
    }
  };

  const handleClipRemove = (clipId: string) => {
    const isCustomAction = customActions.some(a => a.id === clipId);
    if (isCustomAction) {
      setCustomActions(prev => prev.filter(a => a.id !== clipId));
    } else {
      setHiddenActionClips(prev => new Set([...prev, clipId]));
    }
    const next = { ...customThumbnails };
    delete next[clipId];
    setCustomThumbnails(next);
    onThumbnailsChange?.(next);
  };

  const handleClipUpdate = (clipId: string, updated: AnimationClip) => {
    const isCustomAction = customActions.some(a => a.id === clipId);
    if (isCustomAction) {
      setCustomActions(prev => prev.map(a => (a.id === clipId ? updated : a)));
    } else {
      setBuiltInClipUpdates(prev => ({
        ...prev,
        [clipId]: { name: updated.name, duration: updated.duration },
      }));
    }
  };

  const getCategoryClips = (category: (typeof animationCategories)[0]) => {
    // Special behavior for Actions category
    if (category.title.toLowerCase() === "actions") {
      const visibleBuiltIns = category.clips.filter(clip => !hiddenActionClips.has(clip.id));
      const all = [...visibleBuiltIns, ...customActions];
      return all.map(clip => ({ ...clip, ...(builtInClipUpdates[clip.id] || {}) }));
    }
    return category.clips;
  };

  return (
    <div className="bg-card rounded-md border p-3">
      <h3 className="text-sm font-medium mb-2">Action Library</h3>

      {/* IMPORTANT: no flex/overflow-hidden here; let it size to content */}
      <div className="space-y-4">
        {animationCategories
          // Keep transitions out if you want; adjust as needed:
          .filter(cat => cat.title.toLowerCase() !== "transitions")
          .map((category) => {
            const isExpanded = expandedCategories.has(category.title);
            const categoryClips = getCategoryClips(category);

            return (
              <div key={category.title} className="space-y-2">
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={() => toggleCategory(category.title)}
                    className="flex items-center gap-2 flex-1 text-left hover:text-primary transition-colors group"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {category.title}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {categoryClips.length} clips
                    </span>
                  </button>
                  {category.title.toLowerCase() === "actions" && (
                    <AddActionDialog onAddAction={handleAddAction} />
                  )}
                </div>

                {isExpanded && (
                  <div className={cn(
                    category.title.toLowerCase() === "actions"
                      ? "pb-2"
                      : "overflow-x-auto pb-2"
                  )}>
                    {category.title.toLowerCase() === "actions" ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {categoryClips.map((clip) => (
                          <AnimationClipCard
                            key={clip.id}
                            clip={clip}
                            className="w-full h-48"
                            customThumbnail={(() => {
                              const lookupId = clip.id.startsWith("custom-")
                                ? clip.id
                                : clip.id.replace(/[-_]\d+$/, "");
                              return customThumbnails[lookupId];
                            })()}
                            onThumbnailUpdate={handleThumbnailUpdate}
                            onThumbnailRemove={handleThumbnailRemove}
                            onClipRemove={handleClipRemove}
                            onClipUpdate={handleClipUpdate}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex gap-3" style={{ minWidth: "fit-content" }}>
                        {categoryClips.map((clip) => (
                          <div key={clip.id} className="flex-shrink-0" style={{ width: 160 }}>
                            <AnimationClipCard
                              clip={clip}
                              className="w-full h-40"
                              customThumbnail={(() => {
                                const lookupId = clip.id.startsWith("custom-")
                                  ? clip.id
                                  : clip.id.replace(/[-_]\d+$/, "");
                                return customThumbnails[lookupId];
                              })()}
                              onThumbnailUpdate={handleThumbnailUpdate}
                              onThumbnailRemove={handleThumbnailRemove}
                              onClipUpdate={handleClipUpdate}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
