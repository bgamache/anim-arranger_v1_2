import { useEffect, useMemo, useState } from "react";
import { GraphicClip } from "@/types/storyboard";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddGraphicDialog } from "@/components/AddGraphicDialog";
import { GraphicClipCard } from "@/components/GraphicClipCard";
import { useToast } from "@/hooks/use-toast";

const isDataImage = (url?: string): url is string =>
  typeof url === "string" && url.startsWith("data:image");

interface GraphicClipGalleryProps {
  onGraphicSelect?: (graphic: GraphicClip) => void;
  onThumbnailsChange?: (thumbnails: Record<string, string>) => void;
}

const graphicCategories: { title: string; clips: GraphicClip[] }[] = [
  {
    title: "Text",
    clips: [
      {
        id: "text-1",
        name: "Title Text",
        type: "text",
        icon: "📝",
        description: "Add title text overlay",
        color: "#ffffff",
        content: "Your Title Here",
      },
      {
        id: "text-2",
        name: "Body Text",
        type: "text",
        icon: "✍️",
        description: "Add descriptive body text",
        color: "#ffffff",
        content: "Type something...",
      },
    ],
  },
];

const defaultOpenSections = Object.fromEntries(
  graphicCategories.map((category) => [category.title, true])
) as Record<string, boolean>;

export function GraphicClipGallery({ onGraphicSelect, onThumbnailsChange }: GraphicClipGalleryProps = {}) {
  const { toast } = useToast();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    ...defaultOpenSections,
    "Custom Graphics": true,
  });

  const [customGraphics, setCustomGraphics] = useState<GraphicClip[]>(() => {
    try {
      const cached = localStorage.getItem("customGraphics");
      if (!cached) return [];
      const parsed = JSON.parse(cached) as GraphicClip[];
      return Array.isArray(parsed)
        ? parsed.filter(
            (clip) =>
              typeof clip === "object" &&
              clip &&
              typeof clip.id === "string" &&
              isDataImage(clip.imageUrl)
          )
        : [];
    } catch {
      return [];
    }
  });
  const [customThumbnails, setCustomThumbnails] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const clip of customGraphics) {
      if (isDataImage(clip.imageUrl)) out[clip.id] = clip.imageUrl;
    }
    return out;
  });

  // Persist custom graphics to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("customGraphics", JSON.stringify(customGraphics));
    } catch {}
  }, [customGraphics]);

  useEffect(() => {
    setCustomThumbnails((prev) => {
      const next: Record<string, string> = {};
      customGraphics.forEach((clip) => {
        if (clip.imageUrl && isDataImage(clip.imageUrl)) {
          next[clip.id] = clip.imageUrl;
        }
      });
      const changed =
        Object.keys(next).length !== Object.keys(prev).length ||
        Object.keys(next).some((id) => next[id] !== prev[id]);
      if (!changed) return prev;
      try { localStorage.setItem("customThumbnails", JSON.stringify(next)); } catch {}
      return next;
    });
  }, [customGraphics]);

  // notify parent when thumbnails map changes
  useEffect(() => {
    onThumbnailsChange?.(customThumbnails);
  }, [customThumbnails, onThumbnailsChange]);

  const allGraphics: GraphicClip[] = useMemo(() => {
    return [
      ...graphicCategories.flatMap(c => c.clips),
      ...customGraphics,
    ];
  }, [customGraphics]);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleAddGraphic = (g: GraphicClip, thumbnail?: string) => {
    if (!g.imageUrl || !g.imageUrl.startsWith("data:image")) {
      toast({
        title: "Upload images only",
        description: "Please upload an image to add it to the library.",
        variant: "destructive",
      });
      return;
    }
    setCustomGraphics(prev => [g, ...prev]);
    const src = thumbnail ?? g.imageUrl;
    if (src && src.startsWith("data:image")) {
      setCustomThumbnails(prev => ({ ...prev, [g.id]: src }));
    }
  };

  const handleGraphicUpdate = (id: string, updated: GraphicClip) => {
    if (!updated.imageUrl || !updated.imageUrl.startsWith("data:image")) {
      toast({
        title: "Images required",
        description: "Only uploaded images can be stored in the library.",
        variant: "destructive",
      });
      return;
    }
    setCustomGraphics(prev => prev.map(g => (g.id === id ? updated : g)));
  };

  const handleGraphicRemove = (id: string) => {
    setCustomGraphics(prev => prev.filter(g => g.id !== id));
    setCustomThumbnails(prev => {
      const m = { ...prev };
      delete m[id];
      return m;
    });
  };

  const handleThumbUpdate = (id: string, imageUrl: string) => {
    if (!imageUrl.startsWith("data:image")) {
      toast({
        title: "Upload images only",
        description: "Please choose an image file.",
        variant: "destructive",
      });
      return;
    }
    setCustomGraphics(prev => prev.map(g => (g.id === id ? { ...g, imageUrl } : g)));
    setCustomThumbnails(prev => ({ ...prev, [id]: imageUrl }));
  };

  const handleThumbRemove = (id: string) => {
    setCustomGraphics(prev => prev.filter((clip) => clip.id !== id));
    setCustomThumbnails(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border border-border rounded-xl overflow-hidden bg-card/60">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-accent/40 transition-colors"
        onClick={() => toggleSection(title)}
      >
        <span className="text-sm font-semibold">{title}</span>
        {openSections[title] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {openSections[title] && <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Graphics</h2>
        {/* FIX: AddGraphicDialog expects `onAddGraphic`, not `onAdd` */}
        <AddGraphicDialog onAddGraphic={handleAddGraphic} />
      </div>

      {graphicCategories.map((category) => (
        <Section key={category.title} title={category.title}>
          {category.clips.map((clip) => (
            <GraphicClipCard
              key={clip.id}
              clip={clip}
              customThumbnail={customThumbnails[clip.id]}
              onThumbnailUpdate={handleThumbUpdate}
              onThumbnailRemove={handleThumbRemove}
              onClipUpdate={handleGraphicUpdate}
            />
          ))}
        </Section>
      ))}

      {/* Custom */}
      <Section title="Custom Graphics">
        {customGraphics.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center text-sm text-muted-foreground py-6">
            <p>No uploaded images yet.</p>
            <p>Use “Add Graphic” to upload an image into your library.</p>
          </div>
        ) : (
          customGraphics.map((clip) => (
            <GraphicClipCard
              key={clip.id}
              clip={clip}
              customThumbnail={customThumbnails[clip.id]}
              onThumbnailUpdate={handleThumbUpdate}
              onThumbnailRemove={handleThumbRemove}
              onClipRemove={handleGraphicRemove}
              onClipUpdate={handleGraphicUpdate}
            />
          ))
        )}
      </Section>
    </div>
  );
}
