import { useState, useMemo } from "react";
import type { BackgroundTrack, BackgroundTimelineClip } from "@/types/storyboard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";

interface AddBackgroundDialogProps {
  onAddBackground: (track: BackgroundTrack) => void;
}

type GradType = "linear" | "radial";
type RadialShape = "circle" | "ellipse";
type RadialSize = "closest-side" | "closest-corner" | "farthest-side" | "farthest-corner";
type RadialPos =
  | "center" | "top" | "bottom" | "left" | "right"
  | "top left" | "top right" | "bottom left" | "bottom right";

export function AddBackgroundDialog({ onAddBackground }: AddBackgroundDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState<number>(5);
  const [type, setType] = useState<"gradient" | "color" | "image">("gradient");

  // gradient
  const [gradientType, setGradientType] = useState<GradType>("linear");
  const [gradientColor1, setGradientColor1] = useState("#3b82f6");
  const [gradientColor2, setGradientColor2] = useState("#8b5cf6");
  const [gradientDirection, setGradientDirection] = useState("to right");
  const [radialShape, setRadialShape] = useState<RadialShape>("circle");
  const [radialSize, setRadialSize] = useState<RadialSize>("farthest-corner");
  const [radialPos, setRadialPos] = useState<RadialPos>("center");

  // color
  const [solidColor, setSolidColor] = useState("#3b82f6");

  // image
  const [imageUrl, setImageUrl] = useState("");
  const [imageFit, setImageFit] = useState<"cover" | "contain" | "fill" | "repeat">("cover");
  const [imageFileName, setImageFileName] = useState("");

  const deriveFileName = (input: string) => {
    if (!input) return "";
    try {
      const url = input.trim().replace(/^file:\/+/, "");
      const cleaned = url.split(/[?#]/)[0] || "";
      const parts = cleaned.split(/[/\\]/).filter(Boolean);
      return parts.length ? parts[parts.length - 1] : "";
    } catch {
      return "";
    }
  };

  const coerceNumber = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const cssGradient = useMemo(() => {
    if (gradientType === "linear") {
      return `linear-gradient(${gradientDirection}, ${gradientColor1}, ${gradientColor2})`;
    }
    return `radial-gradient(${radialShape} ${radialSize} at ${radialPos}, ${gradientColor1}, ${gradientColor2})`;
  }, [gradientType, gradientDirection, gradientColor1, gradientColor2, radialShape, radialSize, radialPos]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter a background name");
      return;
    }
    const d = Math.max(0.1, Number(duration));
    if (!Number.isFinite(d)) {
      toast.error("Duration must be a number");
      return;
    }
    if (type === "image" && !imageUrl.trim()) {
      toast.error("Please provide an image URL");
      return;
    }

    const start = 0;
    const end = start + d;

    // value: required payload used across UI (CSS string / color / URL)
    const trimmedUrl = imageUrl.trim();
    const value =
      type === "color" ? solidColor :
      type === "image" ? trimmedUrl : cssGradient;

    const gradientStops =
      type === "gradient"
        ? [
            { color: gradientColor1, offset: 0 },
            { color: gradientColor2, offset: 1 },
          ]
        : undefined;

    const baseMeta =
      type === "color"
        ? { kind: "color" as const, color: solidColor }
        : type === "gradient"
        ? {
            kind: "gradient" as const,
            type: gradientType,
            gradientDirection,
            stops: gradientStops ?? [],
          }
        : {
            kind: "image" as const,
            src: trimmedUrl,
            imageFit,
            fileName: imageFileName || deriveFileName(trimmedUrl) || undefined,
          };

    // Optional clip (kept locally if some code ever reads it), not attached to track.
    const _clip: BackgroundTimelineClip = {
      id: `bg-${Date.now()}`,
      name: trimmed,
      type,
      startTime: start,
      endTime: end,
      duration: d,
      value,
      ...(type === "gradient" && {
        gradientDirection,
        gradientColors: [gradientColor1, gradientColor2],
      }),
      ...(type === "color" && { color: solidColor }),
      ...(type === "image" && {
        imageUrl: trimmedUrl,
        imageFit,
      }),
    };

    const backgroundTrack: BackgroundTrack = {
      id: `bg-track-${Date.now()}`,
      name: `Background: ${trimmed}`,
      type,
      value,
      startTime: start,
      endTime: end,
      duration: d,
      gradientDirection: type === "gradient" ? gradientDirection : undefined,
      gradientColors: type === "gradient" ? [gradientColor1, gradientColor2] : undefined,
      color: type === "color" ? solidColor : undefined,
      imageUrl: type === "image" ? trimmedUrl : undefined,
      imageFit: type === "image" ? imageFit : undefined,
      meta: baseMeta,
    };

    onAddBackground(backgroundTrack);

    // reset
    setName("");
    setDuration(5);
    setType("gradient");
    setGradientType("linear");
    setGradientDirection("to right");
    setRadialShape("circle");
    setRadialSize("farthest-corner");
    setRadialPos("center");
    setGradientColor1("#3b82f6");
    setGradientColor2("#8b5cf6");
    setSolidColor("#3b82f6");
    setImageUrl("");
    setImageFit("cover");
    setImageFileName("");
    setOpen(false);

    toast.success("Background track added successfully!");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        toast.error("Could not read image file");
        return;
      }
      setImageUrl(result);
      setImageFileName(file.name);
    };
    reader.onerror = () => {
      toast.error("Failed to read image file");
    };
    reader.readAsDataURL(file);
  };

  const linearDirections = [
    { value: "to right", label: "Left → Right" },
    { value: "to left", label: "Right → Left" },
    { value: "to bottom", label: "Top → Bottom" },
    { value: "to top", label: "Bottom → Top" },
    { value: "45deg", label: "Diagonal (↗ 45°)" },
    { value: "-45deg", label: "Diagonal (↖ -45°)" },
    { value: "135deg", label: "Diagonal (↘ 135°)" },
    { value: "-135deg", label: "Diagonal (↙ -135°)" },
  ];

  const radialShapes = [
    { value: "circle", label: "Circle" },
    { value: "ellipse", label: "Ellipse" },
  ] as const;

  const radialSizes = [
    { value: "closest-side", label: "Closest Side" },
    { value: "closest-corner", label: "Closest Corner" },
    { value: "farthest-side", label: "Farthest Side" },
    { value: "farthest-corner", label: "Farthest Corner" },
  ] as const;

  const radialPositions = [
    { value: "center", label: "Center" },
    { value: "top", label: "Top" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
    { value: "top left", label: "Top Left" },
    { value: "top right", label: "Top Right" },
    { value: "bottom left", label: "Bottom Left" },
    { value: "bottom right", label: "Bottom Right" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Background
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Background Track</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="bg-name">Background Name</Label>
            <Input
              id="bg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sky Gradient, Ocean Blue"
            />
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="bg-duration">Duration (seconds)</Label>
            <Input
              id="bg-duration"
              type="number"
              min="0.1"
              step="0.1"
              value={duration}
              onChange={(e) => setDuration(coerceNumber(e.target.value, duration))}
              onBlur={(e) => {
                const n = Math.max(0.1, coerceNumber(e.target.value, duration));
                if (n !== duration) setDuration(n);
              }}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="bg-type">Background Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gradient">Gradient</SelectItem>
                <SelectItem value="color">Solid Color</SelectItem>
                <SelectItem value="image">Image</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Gradient Settings */}
          {type === "gradient" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Gradient Type</Label>
                <Select value={gradientType} onValueChange={(v) => setGradientType(v as GradType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="radial">Radial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gradientType === "linear" && (
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={gradientDirection} onValueChange={setGradientDirection}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[
                        { value: "to right", label: "Left → Right" },
                        { value: "to left", label: "Right → Left" },
                        { value: "to bottom", label: "Top → Bottom" },
                        { value: "to top", label: "Bottom → Top" },
                        { value: "45deg", label: "Diagonal (↗ 45°)" },
                        { value: "-45deg", label: "Diagonal (↖ -45°)" },
                        { value: "135deg", label: "Diagonal (↘ 135°)" },
                        { value: "-135deg", label: "Diagonal (↙ -135°)" },
                      ].map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {gradientType === "radial" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Shape</Label>
                    <Select value={radialShape} onValueChange={(v) => setRadialShape(v as RadialShape)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="circle">Circle</SelectItem>
                        <SelectItem value="ellipse">Ellipse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Size</Label>
                    <Select value={radialSize} onValueChange={(v) => setRadialSize(v as RadialSize)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closest-side">Closest Side</SelectItem>
                        <SelectItem value="closest-corner">Closest Corner</SelectItem>
                        <SelectItem value="farthest-side">Farthest Side</SelectItem>
                        <SelectItem value="farthest-corner">Farthest Corner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label>Position</Label>
                    <Select value={radialPos} onValueChange={(v) => setRadialPos(v as RadialPos)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[
                          "center","top","bottom","left","right",
                          "top left","top right","bottom left","bottom right",
                        ].map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Color</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={gradientColor1} onChange={(e) => setGradientColor1(e.target.value)} className="w-12 h-8 p-0 border rounded" />
                    <Input value={gradientColor1} onChange={(e) => setGradientColor1(e.target.value)} className="flex-1 text-xs" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>End Color</Label>
                  <div className="flex gap-2">
                    <Input type="color" value={gradientColor2} onChange={(e) => setGradientColor2(e.target.value)} className="w-12 h-8 p-0 border rounded" />
                    <Input value={gradientColor2} onChange={(e) => setGradientColor2(e.target.value)} className="flex-1 text-xs" />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="w-full h-12 rounded border" style={{ background: cssGradient }} />
              </div>
            </div>
          )}

          {/* Solid Color */}
          {type === "color" && (
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                <Input type="color" value={solidColor} onChange={(e) => setSolidColor(e.target.value)} className="w-12 h-8 p-0 border rounded" />
                <Input value={solidColor} onChange={(e) => setSolidColor(e.target.value)} className="flex-1" />
              </div>
            </div>
          )}

          {/* Image */}
          {type === "image" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Image</Label>
                <div className="flex gap-2">
                  <Input
                    value={imageUrl}
                    onChange={(e) => {
                      const val = e.target.value;
                      setImageUrl(val);
                      if (!val) {
                        setImageFileName("");
                        return;
                      }
                      const guessed = deriveFileName(val);
                      if (guessed) setImageFileName(guessed);
                    }}
                    placeholder="Enter image URL or upload file"
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById("image-upload")?.click()}>
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
                <input id="image-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </div>

              <div className="space-y-2">
                <Label>Image Fit</Label>
                <Select value={imageFit} onValueChange={(v) => setImageFit(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Cover (crop to fill)</SelectItem>
                    <SelectItem value="contain">Contain (fit)</SelectItem>
                    <SelectItem value="fill">Fill (stretch)</SelectItem>
                    <SelectItem value="repeat">Repeat (tile)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Button className="w-full" onClick={handleSubmit}>Add Background</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
