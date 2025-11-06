// src/components/AddActionDialog.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Plus, X, FileVideo, Image as ImageIcon, AlertTriangle } from "lucide-react";
import type { AnimationClip } from "@/types/storyboard";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

/** User sets live only in localStorage; public sets are read-only via /public/starter_sets */
const ACTION_SET_KEY = "userActionSets";
type ActionSetMap = Record<string, AnimationClip[]>;

function loadActionSets(): ActionSetMap {
  try {
    const raw = localStorage.getItem(ACTION_SET_KEY);
    return raw ? (JSON.parse(raw) as ActionSetMap) : {};
  } catch {
    return {};
  }
}
function saveActionSets(sets: ActionSetMap) {
  try { localStorage.setItem(ACTION_SET_KEY, JSON.stringify(sets)); } catch {}
}

/**
 * Fetch public (read-only) action starter sets from /public.
 * Returns an array of display names. Supports either:
 *  - { sets: [{ id, name, ...}, ...] }
 *  - { "<SetName>": [...], ... } (object map)  <-- defensive fallback
 */
async function fetchRemoteActionSetNames(): Promise<string[]> {
  const candidates = [
    "/starter_sets/index.json",          // preferred layout
    "/starter_sets/actions/index.json",  // fallback if you segregate actions
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray((data as any)?.sets)) {
        return (data as any).sets
          .map((s: any) => (typeof s?.name === "string" ? s.name : s?.id))
          .filter(Boolean);
      }
      if (data && typeof data === "object") return Object.keys(data as Record<string, unknown>);
    } catch {
      /* ignore and try next candidate */
    }
  }
  return [];
}

/** Common public set names — used for a gentle “collision” warning */
const COMMON_PUBLIC_SET_NAMES = new Set([
  "Strider",
  "Brave",
  "Dash",
]);

/** Insert or update clips inside a user set, deduping by id */
function upsertToActionSet(setName: string, clips: AnimationClip[]) {
  const sets = loadActionSets();
  const existing = sets[setName] ?? [];
  const byId = new Map(existing.map(c => [c.id, c]));
  for (const c of clips) byId.set(c.id, c);
  sets[setName] = Array.from(byId.values());
  saveActionSets(sets);
  window.dispatchEvent(new Event("starter-sets-updated"));
}

interface AddActionDialogProps {
  onAddAction: (action: AnimationClip, thumbnail?: string, videoUrl?: string) => void;
}

export function AddActionDialog({ onAddAction }: AddActionDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // Single action form
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(2.0);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);

  // Bulk upload
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // Starter Set assignment (user sets only) + public sets for reference
  const [sets, setSets] = useState<ActionSetMap>({});
  const [assignToSet, setAssignToSet] = useState(false);
  const [selectedSet, setSelectedSet] = useState("");
  const [newSetName, setNewSetName] = useState("");
  const [warnPublicCollision, setWarnPublicCollision] = useState<string | null>(null);

  // Public (read-only) action sets names
  const [publicSetNames, setPublicSetNames] = useState<string[]>([]);
  const [selectedPublicSetName, setSelectedPublicSetName] = useState<string>("");

  const setOptions = useMemo(() => Object.keys(sets).sort(), [sets]);
  const { toast } = useToast();

  // Load user sets when dialog opens
  useEffect(() => {
    if (open) setSets(loadActionSets());
  }, [open]);

  // Load public set names from /public
  useEffect(() => {
    let alive = true;
    (async () => {
      const names = await fetchRemoteActionSetNames();
      if (!alive) return;
      setPublicSetNames(names);
    })();
    return () => { alive = false; };
  }, []);

  const resetForm = () => {
    setName("");
    setDuration(2.0);
    setDescription("");
    setImage(null);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStatus("");
    setAssignToSet(false);
    setSelectedSet("");
    setNewSetName("");
    setWarnPublicCollision(null);
    setSelectedPublicSetName("");
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

  // If user picks a public set to “copy”, propose a new set name automatically
  useEffect(() => {
    if (selectedPublicSetName && !newSetName.trim() && !selectedSet) {
      setNewSetName(`${selectedPublicSetName} (copy)`);
    }
  }, [selectedPublicSetName, newSetName, selectedSet]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !description.trim()) {
      toast({ title: "Missing fields", description: "Fill all required fields.", variant: "destructive" });
      return;
    }

    const target = ensureTargetSetName(); // may be null if not saving to a set

    const clip: AnimationClip = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim(),
      type: "bounce",
      duration,
      icon: "⚡",
      description: description.trim(),
      imageUrl: image || undefined,
      meta: target ? { characterSet: target } : undefined,
    };

    onAddAction(clip, image || undefined);

    if (target) {
      upsertToActionSet(target, [clip]);
      setSets(loadActionSets());
      toast({ title: "Saved to Starter Set", description: `Added to “${target}”.` });
    } else {
      toast({ title: "Action added", description: `"${clip.name}" added to your library.` });
    }

    setOpen(false);
    resetForm();
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const target = ensureTargetSetName(); // may set collision warning
    setIsUploading(true);
    setUploadProgress(0);

    const created: AnimationClip[] = [];

    let processed = 0;
    const total = files.length;

    for (const file of files) {
      try {
        setUploadStatus(`Processing ${file.name}…`);
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");

        if (!isVideo && !isImage) {
          sonnerToast.error(`Skipped ${file.name}: only images/videos supported`);
          processed++; setUploadProgress((processed / total) * 100);
          continue;
        }
        if (file.size > 100 * 1024 * 1024) {
          sonnerToast.error(`Skipped ${file.name}: >100MB`);
          processed++; setUploadProgress((processed / total) * 100);
          continue;
        }

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        if (isVideo) {
          const dur = await new Promise<number>((resolve, reject) => {
            const v = document.createElement("video");
            v.src = dataUrl;
            v.addEventListener("loadedmetadata", () => {
              const d = Math.max(0.1, Math.round((v.duration || 2) * 10) / 10);
              v.remove(); resolve(d);
            });
            v.addEventListener("error", () => { v.remove(); reject(new Error("metadata error")); });
            v.load();
          });

          const clip: AnimationClip = {
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: fileName,
            type: "bounce",
            duration: dur,
            icon: "🎬",
            description: `Auto-imported video: ${fileName}`,
            meta: target ? { characterSet: target } : undefined
          };
          created.push(clip);
          onAddAction(clip, undefined, dataUrl);
        } else {
          const clip: AnimationClip = {
            id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: fileName,
            type: "bounce",
            duration: 2.0,
            icon: "🖼️",
            description: `Auto-imported image: ${fileName}`,
            imageUrl: dataUrl,
            meta: target ? { characterSet: target } : undefined,
          };
          created.push(clip);
          onAddAction(clip, dataUrl);
        }

        processed++;
        setUploadProgress((processed / total) * 100);
        await new Promise(r => setTimeout(r, 50));
      } catch (err) {
        console.error(err);
        sonnerToast.error(`Failed ${file.name}`);
        processed++;
        setUploadProgress((processed / total) * 100);
      }
    }

    if (target && created.length) {
      upsertToActionSet(target, created);
      setSets(loadActionSets());
      sonnerToast.success(`Saved ${created.length} action(s) to “${target}”.`);
    }

    setUploadStatus("Upload complete!");
    sonnerToast.success(`Imported ${processed} / ${total}`);

    setTimeout(() => { setOpen(false); resetForm(); }, 900);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1">
          <Plus className="w-3 h-3" />
          Add Actions
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Add Actions</DialogTitle>
        </DialogHeader>

        {/* Assign to Starter Set (user sets only) */}
        <div className="mb-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="assign-set"
              type="checkbox"
              checked={assignToSet}
              onChange={(e) => setAssignToSet(e.target.checked)}
            />
            <Label htmlFor="assign-set" className="cursor-pointer">Save into a Starter Set</Label>
          </div>

          {assignToSet && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Choose existing (your sets)</Label>
                <select
                  className="w-full h-9 px-2 border rounded bg-background"
                  value={selectedSet}
                  onChange={(e) => setSelectedSet(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {setOptions.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">Create new</Label>
                <Input
                  placeholder="My Action Set"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                />
              </div>

              {/* Helper to copy a public set name */}
              <div className="md:col-span-2">
                <Label className="text-xs">Copy public set (read-only)</Label>
                <select
                  className="w-full h-9 px-2 border rounded bg-background"
                  value={selectedPublicSetName}
                  onChange={(e) => setSelectedPublicSetName(e.target.value)}
                >
                  <option value="">— None —</option>
                  {publicSetNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Selecting a public set doesn’t modify it; we’ll just prefill “Create new” with a suggested name (e.g. “{selectedPublicSetName || "Set"} (copy)”).
                </p>
              </div>

              {warnPublicCollision && (
                <div className="md:col-span-2 flex items-start gap-2 text-amber-600 text-xs mt-1">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  The name “{warnPublicCollision}” is commonly used by public sets. Consider a distinct name to avoid confusion.
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
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <Label>Duration (s)</Label>
                  <Input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={duration}
                    onChange={(e) => setDuration(parseFloat(e.target.value))}
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} required />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" className="h-9" onClick={() => document.getElementById("action-img")?.click()}>
                  <ImageIcon className="w-4 h-4 mr-1" />
                  Upload image (optional)
                </Button>
                <input id="action-img" type="file" accept="image/*" hidden onChange={handleImageUpload} />
                {image && (
                  <div className="flex items-center gap-2 text-xs">
                    <img src={image} alt="thumb" className="w-10 h-10 object-cover rounded border" />
                    <button type="button" onClick={() => setImage(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-1">
                <Button type="submit" className="h-9">Add Action</Button>
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
                  onClick={() => document.getElementById("action-bulk")?.click()}
                >
                  <FileVideo className="w-4 h-4 mr-1" />
                  Select images/videos…
                </Button>
                <input
                  id="action-bulk"
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  onChange={handleBulkUpload}
                />
              </div>

              {isUploading && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} />
                  <div className="text-xs text-muted-foreground">{uploadStatus}</div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
