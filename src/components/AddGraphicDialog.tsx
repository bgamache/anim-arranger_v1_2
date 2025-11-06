import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Plus, X, Image as ImageIcon, AlertTriangle } from "lucide-react";
import type { GraphicClip } from "@/types/storyboard";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

/** User sets in localStorage; public sets are read-only */
const GRAPHIC_SET_KEY = "userGraphicSets";
type GraphicSetMap = Record<string, GraphicClip[]>;

function loadGraphicSets(): GraphicSetMap {
  try {
    const raw = localStorage.getItem(GRAPHIC_SET_KEY);
    return raw ? (JSON.parse(raw) as GraphicSetMap) : {};
  } catch {
    return {};
  }
}
function saveGraphicSets(sets: GraphicSetMap) {
  try {
    localStorage.setItem(GRAPHIC_SET_KEY, JSON.stringify(sets));
  } catch {
    /* ignore */
  }
}

const COMMON_PUBLIC_SET_NAMES = new Set(["UI Icons", "Emoji Sampler"]);

function upsertToGraphicSet(setName: string, clips: GraphicClip[]) {
  const sets = loadGraphicSets();
  const existing = sets[setName] ?? [];
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of clips) byId.set(c.id, c);
  sets[setName] = Array.from(byId.values());
  saveGraphicSets(sets);
  window.dispatchEvent(new Event("starter-sets-updated"));
}

interface AddGraphicDialogProps {
  onAddGraphic: (graphic: GraphicClip, thumbnail?: string) => void;
}

export function AddGraphicDialog({ onAddGraphic }: AddGraphicDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // Single graphic form
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "shape" | "icon">("icon");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null);

  // Bulk
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // Starter set assignment
  const [sets, setSets] = useState<GraphicSetMap>({});
  const [assignToSet, setAssignToSet] = useState(false);
  const [selectedSet, setSelectedSet] = useState("");
  const [newSetName, setNewSetName] = useState("");
  const [warnPublicCollision, setWarnPublicCollision] = useState<string | null>(
    null
  );

  const setOptions = useMemo(() => Object.keys(sets).sort(), [sets]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setSets(loadGraphicSets());
  }, [open]);

  const resetForm = () => {
    setName("");
    setType("icon");
    setDescription("");
    setColor("#3b82f6");
    setContent("");
    setImage(null);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStatus("");
    setAssignToSet(false);
    setSelectedSet("");
    setNewSetName("");
    setWarnPublicCollision(null);
  };

  const ensureTargetSetName = (): string | null => {
  if (!assignToSet) return null;
    const target = (newSetName.trim() || selectedSet).trim();
    if (!target) {
      toast({
        title: "Select or create a Starter Set",
        description: "Choose an existing set or type a new name.",
        variant: "destructive",
      });
      return null;
    }
    if (COMMON_PUBLIC_SET_NAMES.has(target)) {
      setWarnPublicCollision(target);
    } else {
      setWarnPublicCollision(null);
    }
    return target;
  };

  const iconForType = (t: string) =>
    t === "text" ? "📝" : t === "shape" ? "⭕" : "⭐";

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !description.trim()) {
      toast({
        title: "Missing fields",
        description: "Fill all required fields.",
        variant: "destructive",
      });
      return;
    }
    if (!image || !image.startsWith("data:image")) {
      toast({
        title: "Upload an image",
        description: "Custom graphics must use an uploaded image.",
        variant: "destructive",
      });
      return;
    }

    const clip: GraphicClip = {
      id: `custom-graphic-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`,
      name: name.trim(),
      type,
      icon: iconForType(type),
      description: description.trim(),
      color,
      ...(type === "text" && content ? { content: content.trim() } : {}),
      imageUrl: image,
    };

    onAddGraphic(clip, image);

    const target = ensureTargetSetName();
    if (target) {
      upsertToGraphicSet(target, [clip]);
      setSets(loadGraphicSets());
      toast({
        title: "Saved to Starter Set",
        description: `Added to “${target}”.`,
      });
    } else {
      toast({
        title: "Graphic added",
        description: `"${clip.name}" added to your library.`,
      });
    }

    setOpen(false);
    resetForm();
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const target = ensureTargetSetName();
    setIsUploading(true);
    setUploadProgress(0);

    const created: GraphicClip[] = [];
    let processed = 0;
    const total = files.length;

    for (const file of files) {
      try {
        setUploadStatus(`Processing ${file.name}…`);
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        const isImage = file.type.startsWith("image/");
        if (!isImage) {
          sonnerToast.error(`Skipped ${file.name}: only images supported`);
          processed++;
          setUploadProgress((processed / total) * 100);
          continue;
        }
        if (file.size > 100 * 1024 * 1024) {
          sonnerToast.error(`Skipped ${file.name}: >100MB`);
          processed++;
          setUploadProgress((processed / total) * 100);
          continue;
        }

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const clip: GraphicClip = {
          id: `custom-graphic-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`,
          name: fileName,
          type: "icon",
          icon: "🖼️",
          description: `Auto-imported image: ${fileName}`,
          color: "#ffffff",
          imageUrl: dataUrl,
          meta: { fileName: file.name },
        };
        created.push(clip);
        onAddGraphic(clip, dataUrl);

        processed++;
        setUploadProgress((processed / total) * 100);
        await new Promise((r) => setTimeout(r, 50));
      } catch (err) {
        console.error(err);
        sonnerToast.error(`Failed ${file.name}`);
        processed++;
        setUploadProgress((processed / total) * 100);
      }
    }

    if (target && created.length) {
      upsertToGraphicSet(target, created);
      setSets(loadGraphicSets());
      sonnerToast.success(
        `Saved ${created.length} graphic(s) to “${target}”.`
      );
    }

    setUploadStatus("Upload complete!");
    sonnerToast.success(`Imported ${processed} / ${total}`);

    setTimeout(() => {
      setOpen(false);
      resetForm();
    }, 900);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1">
          <Plus className="w-3 h-3" />
          Add Graphics
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add Graphics</DialogTitle>
        </DialogHeader>

        {/* Assign to Starter Set (user sets only) */}
        <div className="mb-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              id="assign-graphic-set"
              type="checkbox"
              checked={assignToSet}
              onChange={(e) => setAssignToSet(e.target.checked)}
            />
            <Label htmlFor="assign-graphic-set" className="cursor-pointer">
              Save into a Starter Set
            </Label>
          </div>

          {assignToSet && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Choose existing</Label>
                <select
                  className="w-full h-9 px-2 border rounded bg-background"
                  value={selectedSet}
                  onChange={(e) => setSelectedSet(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {setOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Or create new</Label>
                <Input
                  placeholder="My Graphic Set"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                />
              </div>

              {warnPublicCollision && (
                <div className="col-span-2 flex items-start gap-2 text-amber-600 text-xs mt-1">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  The name “{warnPublicCollision}” is commonly used by public
                  sets. Consider a distinct name to avoid confusion.
                </div>
              )}
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-3">
            <TabsTrigger value="single">Single</TabsTrigger>
            <TabsTrigger value="bulk">Bulk</TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <select
                    className="w-full h-9 px-2 border rounded bg-background"
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                  >
                    <option value="icon">Icon</option>
                    <option value="shape">Shape</option>
                    <option value="text">Text</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                {type !== "text" ? (
                  <div className="col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <Label>Accent Color (optional)</Label>
                      <Input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="col-span-2">
                    <Label>Text Content</Label>
                    <Input
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Your text…"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9"
                  onClick={() =>
                    document.getElementById("graphic-img")?.click()
                  }
                >
                  <ImageIcon className="w-4 h-4 mr-1" />
                  Upload image (required)
                </Button>
                <input
                  id="graphic-img"
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleImageUpload}
                />
                {image && (
                  <div className="flex items-center gap-2 text-xs">
                    <img
                      src={image}
                      alt="thumb"
                      className="w-10 h-10 object-cover rounded border"
                    />
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-1">
                <Button type="submit" className="h-9">
                  Add Graphic
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="bulk">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9"
                  onClick={() =>
                    document.getElementById("graphic-bulk")?.click()
                  }
                >
                  <ImageIcon className="w-4 h-4 mr-1" />
                  Select images…
                </Button>
                <input
                  id="graphic-bulk"
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleBulkUpload}
                />
              </div>

              {isUploading && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} />
                  <div className="text-xs text-muted-foreground">
                    {uploadStatus}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
