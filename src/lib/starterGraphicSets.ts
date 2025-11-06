// src/lib/starterGraphicSets.ts
import type { GraphicClip } from "@/types/storyboard";

type IndexJson = {
  sets: {
    id: string;
    name: string;
    items: Array<{
      id: string;
      name: string;
      type?: "text" | "shape" | "icon";
      description?: string;
      color?: string;
      content?: string;   // for text clips
      image?: string;     // legacy support
      thumbnail?: string; // file under /starter_sets/starter_graphics/<id>/... OR emoji
    }>;
  }[];
};

// ADD: heuristic to treat a short string as an emoji (not a file path)
function isLikelyEmoji(s?: string): boolean {
  if (!s) return false;
  // Paths, data-urls, or filenames with extensions are NOT emojis
  if (s.includes("/") || s.includes("\\") || s.startsWith("data:")) return false;
  if (/\.[a-zA-Z0-9]+$/.test(s)) return false;
  // Prefer Unicode Extended Pictographic where supported
  try {
    if (/\p{Extended_Pictographic}/u.test(s)) return true;
  } catch {
    // Fallback: common emoji ranges
    if (/[\u231A-\u27BF\uFE0F\u2600-\u26FF\uD83C-\uDBFF\uDC00-\uDFFF]/.test(s)) return true;
  }
  // Also allow very short “emoji-like” strings (e.g., single-char)
  return s.length <= 3;
}

const CACHE_KEY = "remoteGraphicSetsCache";

const EXCLUDED_SET_PATTERNS = [
  /\bshape\b/i,
  /\bshapes\b/i,
  /\bicon\b/i,
  /\bicons\b/i,
];

function build(indexJson: IndexJson | null): Record<string, GraphicClip[]> {
  const out: Record<string, GraphicClip[]> = {};
  for (const set of indexJson?.sets ?? []) {
    const setLabel = (set.name || set.id || "").trim();
    if (EXCLUDED_SET_PATTERNS.some((re) => re.test(setLabel))) continue;
    // NOTE: keep your original folder structure, just add a leading slash
    const folder = `/starter_sets/starter_graphics/${set.id}`;

    const clips: GraphicClip[] = (set.items || []).map((it) => {
      const source = it.thumbnail ?? it.image;
      const emojiAsIcon = isLikelyEmoji(source);
      return {
        id: `${set.id}-${it.id}`,
        name: it.name,
        type: it.type ?? "icon",

        // emoji-aware icon
        icon: emojiAsIcon
          ? (source as string)
          : (it?.type === "text" ? "📝" : it?.type === "shape" ? "⭕" : "⭐"),

        description: it.description,
        color: it.color,
        content: it.content,

        // only set imageUrl when it's not an emoji
        imageUrl: !emojiAsIcon && source
          ? (source.match(/^https?:\/\//) || source.startsWith("data:")
              ? source
              : `${folder}/${source}`)
          : undefined,
      };
    });

    out[setLabel] = clips;
  }
  return out;
}

/** Load starter graphics from /public/starter_sets/starter_graphics/index.json (read-only). */
export async function loadRemoteGraphicSets(): Promise<Record<string, GraphicClip[]>> {
  // 1) Always try to fetch fresh (avoid stale)
  try {
    const url = `/starter_sets/starter_graphics/index.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as IndexJson;
      const built = build(json);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(built)); } catch {}
      return built;
    } else {
      console.warn("[starterGraphicSets] HTTP", res.status, "for", url);
    }
  } catch (e) {
    console.warn("[starterGraphicSets] fetch error:", e);
  }

  // 2) Fallback to cache if available
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Record<string, GraphicClip[]>;
  } catch {
    /* ignore */
  }

  return {};
}

/** Utility to force-refresh from the UI/devtools if needed. */
export async function refreshRemoteGraphicSets() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
  return loadRemoteGraphicSets();
}
