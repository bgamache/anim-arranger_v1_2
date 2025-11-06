// src/components/LibraryGallery.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import type { AnimationClip, GraphicClip } from "@/types/storyboard";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AddActionDialog } from "@/components/AddActionDialog";
import { AddGraphicDialog } from "@/components/AddGraphicDialog";
import { ClipCard } from "@/components/ClipCard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { loadRemoteGraphicSets } from "@/lib/starterGraphicSets";

// ====== Built-in presets (unchanged – keep your local starter sets here too) ======

const BUILTIN_ACTION_SETS: Record<string, AnimationClip[]> = {};

// Removed: loadRemoteActionSets import (no longer exported by starterSets)
// We provide a local replacement below that reads /starter_sets/index.json.

// Local helper that mimics the old API: returns { [displayName]: AnimationClip[] }
async function loadActionSets(): Promise<Record<string, AnimationClip[]>> {
  type IndexJson = {
    sets: {
      id: string;
      name?: string;
      characterSet?: string;
      items: Array<{
        id: string;
        name?: string;
        type?: string;
        duration?: number;
        image?: string;        // filename or URL
        description?: string;
      }>;
    }[];
  };

  // Try the canonical index; feel free to add other candidates if your layout differs
  const url = "/starter_sets/index.json";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as IndexJson;
    const out: Record<string, AnimationClip[]> = {};
    for (const set of data?.sets ?? []) {
      const label = set.name || set.id;
      const folder = `/starter_sets/${set.id}`;
      const clips: AnimationClip[] = (set.items ?? []).map((it) => {
        const imageUrl =
          it.image
            ? (/^(https?:)?\/\//.test(it.image) || it.image.startsWith("data:")
                ? it.image
                : `${folder}/${it.image}`)
            : undefined;
        return {
          id: it.id,
          name: it.name || it.id,
          type: it.type || "bounce",
          duration: typeof it.duration === "number" ? it.duration : 2.0,
          icon: "🎬",
          description: it.description,
          imageUrl,
          // 👇 carry character-set label for CSV export
          meta: { characterSet: set.characterSet || set.id || set.name || "Unknown" },
        } as AnimationClip;
      });
      out[label] = clips;
    }
    return out;
  } catch (e) {
    console.warn("[LibraryGallery] Failed to load /starter_sets/index.json:", e);
    return {};
  }
}

// ---- Graphics built-ins (unchanged from your current file) ----
const BUILTIN_GRAPHIC_SETS: Record<string, GraphicClip[]> = {};
const TEXT_CLIPS: GraphicClip[] = [
  { id: "text-1", name: "Title Text", type: "text", icon: "📝", description: "Add title text overlay", color: "#ffffff", content: "Your Title Here" },
];

const isDataImage = (url?: string): url is string =>
  typeof url === "string" && url.startsWith("data:image");

const filterImageClips = (clips: GraphicClip[] | undefined): GraphicClip[] =>
  (clips ?? []).filter((clip) => isDataImage(clip.imageUrl));

export interface LibraryGalleryProps {
  onThumbnailsChange?: (thumbnails: Record<string, string>) => void;
}

export function LibraryGallery({ onThumbnailsChange }: LibraryGalleryProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState<Record<string, boolean>>({
    Actions: true,
    Text: true,
    Graphics: true,
  });

  // User Starter Sets (from Add dialogs)
  const [userActionSets, setUserActionSets] = useState<Record<string, AnimationClip[]>>({});
  const [userGraphicSets, setUserGraphicSets] = useState<Record<string, GraphicClip[]>>({});
  const reloadUserSets = useCallback(() => {
    // Actions: inject meta.characterSet with the set's name
    try {
      const raw = JSON.parse(localStorage.getItem("userActionSets") ?? "{}") as Record<string, AnimationClip[]>;
      const withMeta: Record<string, AnimationClip[]> = {};
      for (const [setName, clips] of Object.entries(raw)) {
        withMeta[setName] = (clips ?? []).map((c) => ({
          ...c,
          meta: { ...(c as any).meta, characterSet: setName },
        }));
      }
      setUserActionSets(withMeta);
    } catch {
      setUserActionSets({});
    }

    // Graphics: same idea so graphics CSV can also pick it up (optional, but consistent)
    try {
      const rawG = JSON.parse(localStorage.getItem("userGraphicSets") ?? "{}") as Record<string, GraphicClip[]>;
      const withMetaG: Record<string, GraphicClip[]> = {};
      for (const [setName, clips] of Object.entries(rawG)) {
        const filtered = filterImageClips(clips);
        if (!filtered.length) continue;
        withMetaG[setName] = filtered.map((c) => ({
          ...c,
          meta: { ...(c as any).meta, characterSet: setName },
        }));
      }
      setUserGraphicSets(withMetaG);
    } catch {
      setUserGraphicSets({});
    }
  }, []);

  // NEW: Remote action sets discovered in /public/starter_sets/index.json
  const [remoteActionSets, setRemoteActionSets] = useState<Record<string, AnimationClip[]>>({});
 
  useEffect(() => {
    let alive = true;
    (async () => {
      const remote = await loadActionSets(); // gracefully returns {} if missing/failed
      if (!alive) return;
      setRemoteActionSets(remote);
    })();
    return () => { alive = false; };
  }, []);

  // Merge built-ins + remote + user sets
  // Local UI state for customs
  const [customActions, setCustomActions] = useState<AnimationClip[]>([]);
  const [customGraphics, setCustomGraphics] = useState<GraphicClip[]>([]);
  const [customThumbnails, setCustomThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    try { const ca = localStorage.getItem("customActions"); if (ca) setCustomActions(JSON.parse(ca)); } catch {}
    try {
      const cg = localStorage.getItem("customGraphics");
      if (cg) setCustomGraphics(filterImageClips(JSON.parse(cg)));
    } catch {}
    try {
      const thumbs = localStorage.getItem("customThumbnails");
      if (thumbs) {
        const parsed = JSON.parse(thumbs) as Record<string, string>;
        const filtered: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed || {})) {
          if (isDataImage(v)) filtered[k] = v;
        }
        setCustomThumbnails(filtered);
      }
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("customActions", JSON.stringify(customActions)); } catch {} }, [customActions]);
  useEffect(() => {
    try {
      localStorage.setItem("customGraphics", JSON.stringify(filterImageClips(customGraphics)));
    } catch {}
  }, [customGraphics]);

  // Thumbnail helpers (still useful for timeline/preview that rely on id->url maps)
  const applyThumbDelta = (delta: Record<string, string | null>) => {
    setCustomThumbnails(prev => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(delta)) {
        if (v == null) delete next[k];
        else next[k] = v;
      }
      try { localStorage.setItem("customThumbnails", JSON.stringify(next)); } catch {}
      return next;
    });
    const positives: Record<string, string> = {};
    for (const [k, v] of Object.entries(delta)) if (typeof v === "string") positives[k] = v;
    if (Object.keys(positives).length) onThumbnailsChange?.(positives);
  };
  const updateThumb = (id: string, url: string) => applyThumbDelta({ [id]: url });
  const removeThumb = (id: string) => applyThumbDelta({ [id]: null });

  const actionSetOptions = useMemo(
    () => ({ ...remoteActionSets, ...userActionSets }),
    [userActionSets, remoteActionSets]
  );
  const filteredUserGraphicSets = useMemo(() => {
    const out: Record<string, GraphicClip[]> = {};
    for (const [setName, clips] of Object.entries(userGraphicSets)) {
      const filtered = filterImageClips(clips);
      if (filtered.length) out[setName] = filtered;
    }
    return out;
  }, [userGraphicSets]);

  const [remoteGraphicSets, setRemoteGraphicSets] = useState<Record<string, GraphicClip[]>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const remote = await loadRemoteGraphicSets();
      if (!alive) return;
      setRemoteGraphicSets(remote);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const uploadsOnly = useMemo(() => filterImageClips(customGraphics), [customGraphics]);

  const baseGraphicPresets = useMemo(
    () => ({ ...BUILTIN_GRAPHIC_SETS, ...remoteGraphicSets, ...filteredUserGraphicSets }),
    [remoteGraphicSets, filteredUserGraphicSets]
  );

  const graphicSetOptions = useMemo(() => {
    if (uploadsOnly.length) {
      return { Uploads: uploadsOnly, ...baseGraphicPresets };
    }
    return baseGraphicPresets;
  }, [baseGraphicPresets, uploadsOnly]);

  const [selectedGraphicSet, setSelectedGraphicSet] = useState<string>("");
  const [selectedActionSet, setSelectedActionSet] = useState<string>("Starter Set");

  useEffect(() => {
    const keys = Object.keys(actionSetOptions);
    if (!keys.includes(selectedActionSet)) setSelectedActionSet(keys[0] ?? "Starter Set");
  }, [actionSetOptions, selectedActionSet]);
  useEffect(() => {
    const keys = Object.keys(graphicSetOptions);
    if (!keys.includes(selectedGraphicSet)) setSelectedGraphicSet(keys[0] ?? "");
  }, [graphicSetOptions, selectedGraphicSet]);

  // Whenever a remote action set is selected, publish its imageUrl map as thumbnails too
  useEffect(() => {
    const current = actionSetOptions[selectedActionSet] || [];
    const map: Record<string, string> = {};
    current.forEach((c) => { if (c.imageUrl) map[c.id] = c.imageUrl; });
    if (Object.keys(map).length) {
      // merge to local and notify upstream
      setCustomThumbnails(prev => {
        const next = { ...map, ...prev }; // remote first so local overrides win
        try { localStorage.setItem("customThumbnails", JSON.stringify(next)); } catch {}
        return next;
      });
      onThumbnailsChange?.(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedActionSet, actionSetOptions]);

  // publish thumbnails when the selected Graphic set changes (optional)
  useEffect(() => {
    const current = graphicSetOptions[selectedGraphicSet] || [];
    const map: Record<string, string> = {};
    current.forEach((c) => { if (isDataImage(c.imageUrl)) map[c.id] = c.imageUrl as string; });
    if (Object.keys(map).length) {
      setCustomThumbnails(prev => {
        const next = { ...map, ...prev };
        try { localStorage.setItem("customThumbnails", JSON.stringify(next)); } catch {}
        return next;
      });
      onThumbnailsChange?.(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGraphicSet, graphicSetOptions]);

  useEffect(() => {
    reloadUserSets();
    const onUpdate = () => reloadUserSets();
    window.addEventListener("starter-sets-updated", onUpdate);
    return () => window.removeEventListener("starter-sets-updated", onUpdate);
  }, [reloadUserSets]);
  
  const handleDragStartAction = (clip: AnimationClip, setName: string) => (e: React.DragEvent) => {
     const payload = {
       kind: "action",
       clip: {
        ...clip,
        meta: { ...(clip as any).meta, characterSet: setName },
       },
       sourceSetName: setName,
     };
     e.dataTransfer.setData("application/x-clip", JSON.stringify(payload));
   };

  const handleDragStartGraphic = (clip: GraphicClip, setName: string) => (e: React.DragEvent) => {
     const payload = {
       kind: "graphic",
       clip: {
        ...clip,
        meta: { ...(clip as any).meta, characterSet: setName },
       },
       sourceSetName: setName,
     };
     e.dataTransfer.setData("application/x-clip", JSON.stringify(payload));
   };

  // Actions add/update/remove
  const handleAddAction = (a: AnimationClip, thumbnail?: string) => {
    setCustomActions(prev => [a, ...prev]);
    if (thumbnail || a.imageUrl) applyThumbDelta({ [a.id]: thumbnail || a.imageUrl || null });
  };
  const handleUpdateAction = (id: string, updated: AnimationClip) => {
    setCustomActions(prev => prev.map(a => (a.id === id ? updated : a)));
    if (updated.imageUrl) applyThumbDelta({ [id]: updated.imageUrl });
  };
  const handleRemoveAction = (id: string) => {
    setCustomActions(prev => prev.filter(a => a.id !== id));
    applyThumbDelta({ [id]: null });
  };

  // Graphics add/update/remove (unchanged)
  const handleAddGraphic = (g: GraphicClip) => {
    if (!isDataImage(g.imageUrl)) {
      toast({
        title: "Upload images only",
        description: "Please upload an image to add it to the library.",
        variant: "destructive",
      });
      return;
    }
    setCustomGraphics(prev => [g, ...prev]);
    applyThumbDelta({ [g.id]: g.imageUrl });
  };
  const handleUpdateGraphic = (id: string, updated: GraphicClip) => {
    if (!isDataImage(updated.imageUrl)) {
      toast({
        title: "Images required",
        description: "Only uploaded images can stay in the library.",
        variant: "destructive",
      });
      return;
    }
    setCustomGraphics(prev => prev.map(x => (x.id === id ? updated : x)));
    applyThumbDelta({ [id]: updated.imageUrl });
  };
  const handleRemoveGraphic = (id: string) => {
    setCustomGraphics(prev => prev.filter(x => x.id !== id));
    applyThumbDelta({ [id]: null });
  };

  // Derived lists
  const presetActions = useMemo(
    () => actionSetOptions[selectedActionSet] || [],
    [actionSetOptions, selectedActionSet]
  );
  const allActions = useMemo(
    () => [...presetActions, ...customActions],
    [presetActions, customActions]
  );
  const presetGraphics = useMemo(
    () => graphicSetOptions[selectedGraphicSet] || [],
    [graphicSetOptions, selectedGraphicSet]
  );
  const allGraphics = useMemo(() => presetGraphics, [presetGraphics]);
  const allText = useMemo(
    () => [...TEXT_CLIPS, ...customGraphics.filter(g => g.type === "text")],
    [customGraphics]
  );

  /** Collapsible section */
  const Section = ({
    title,
    control,
    children,
  }: {
    title: string;
    control?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div className="flex-1 basis-0 min-w-0 border border-border rounded-xl overflow-hidden bg-card/60">
      <div className="w-full flex items-center justify-between px-4 py-2 hover:bg-accent/40 transition-colors">
        <button
          type="button"
          className="flex items-center gap-2"
          onClick={() => setOpen(prev => ({ ...prev, [title]: !prev[title] }))}
        >
          <span className="text-sm font-semibold">{title}</span>
          {open[title] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {control}
      </div>

      {open[title] && (
        <div className="p-3 overflow-auto max-h-[920px]">
          <div className="grid gap-3 justify-items-center grid-cols-[repeat(auto-fill,minmax(148px,1fr))]">
            {children}
          </div>
        </div>
      )}
    </div>
  );

  // Dropdowns
  const actionPresetKeys = Object.keys(actionSetOptions);
  const graphicPresetKeys = Object.keys(graphicSetOptions);

  const ActionPresetSelect = (
    <select
      className="h-8 text-xs border rounded px-2 bg-background"
      value={selectedActionSet}
      onChange={(e) => setSelectedActionSet(e.target.value)}
      title="Choose an action preset set"
    >
      {actionPresetKeys.map((k) => (
        <option key={k} value={k}>{k}</option>
      ))}
    </select>
  );
  const GraphicPresetSelect = graphicPresetKeys.length ? (
    <select
      className="h-8 text-xs border rounded px-2 bg-background"
      value={selectedGraphicSet}
      onChange={(e) => setSelectedGraphicSet(e.target.value)}
      title="Choose a graphic preset set"
    >
      {graphicPresetKeys.map((k) => (
        <option key={k} value={k}>{k}</option>
      ))}
    </select>
  ) : undefined;

  return (
    <div className="bg-card rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold">Library</h2>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2">
            <AddActionDialog onAddAction={handleAddAction} />
            <AddGraphicDialog onAddGraphic={handleAddGraphic} />
          </div>

          <div className="flex items-center gap-2 sm:hidden">
            <AddGraphicDialog onAddGraphic={handleAddGraphic} />
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-stretch">
        {/* Actions */}
        <Section title="Actions" control={ActionPresetSelect}>
          {allActions.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-4">
              No actions yet. Use “Add Action” or select another preset.
            </div>
          ) : (
            allActions.map((clip) => (
              <ClipCard
                key={clip.id}
                variant="action"
                clip={clip}
                className="w-full"
                customThumbnail={customThumbnails[clip.id]}
                onThumbnailUpdate={updateThumb}
                onThumbnailRemove={removeThumb}
                onClipRemove={clip.id.startsWith("custom-") ? handleRemoveAction : undefined}
                onClipUpdate={handleUpdateAction}
              />
            ))
          )}
        </Section>

        {/* Graphics */}
        <Section title="Graphics" control={GraphicPresetSelect}>
          {allGraphics.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-4 text-center">
              No uploaded images yet. Use “Add Graphic” to upload one.
            </div>
          ) : (
            allGraphics.map((clip) => (
              <ClipCard
                key={clip.id}
                variant="graphic"
                clip={clip}
                className="w-full"
                customThumbnail={customThumbnails[clip.id]}
                onThumbnailUpdate={updateThumb}
                onThumbnailRemove={removeThumb}
                onClipRemove={clip.id.startsWith("custom-") ? handleRemoveGraphic : undefined}
                onClipUpdate={handleUpdateGraphic}
              />
            ))
          )}
        </Section>

        {/* Text */}
        <Section title="Text">
          {allText.map((clip) => (
            <ClipCard
              key={clip.id}
              variant="text"
              clip={clip}
              className="w-full"
              customThumbnail={customThumbnails[clip.id]}
              onThumbnailUpdate={updateThumb}
              onThumbnailRemove={removeThumb}
              onClipRemove={clip.id.startsWith("custom-") ? handleRemoveGraphic : undefined}
              onClipUpdate={handleUpdateGraphic}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}
