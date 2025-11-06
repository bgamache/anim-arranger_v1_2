import { useCallback, useMemo } from "react";
import { Timeline } from "@/components/Timeline";
import { PreviewWindow } from "@/components/PreviewWindow";
import { LibraryGallery } from "@/components/LibraryGallery";
import { useTimelineStore } from "@/store/TimelineStore";
import type {
  Track,
  AudioTrack,
  BackgroundTrack,
  TimelineClip,
  GraphicTimelineClip,
} from "@/types/storyboard";
import { ProjectIOButtons } from "@/components/ProjectIOButtons";

const Index = () => {
  // Grab the whole store object so we can safely use optional methods.
  const store = useTimelineStore();

  const {
    tracks = [],
    audioTracks = [],
    backgroundTracks = [],
    graphics = [],
    clips = [],
    isPlaying,
    currentTime,
    customThumbnails = {},
  } = store;

  const handleTracksChange = useCallback(
    (newTracks: Track[]) => store.setTracks?.(newTracks),
    [store]
  );

  const handleAudioTracksChange = useCallback(
    (t: AudioTrack[]) => store.setAudioTracks?.(t),
    [store]
  );

  const handleBackgroundTracksChange = useCallback(
    (t: BackgroundTrack[]) => store.setBackgroundTracks?.(t),
    [store]
  );

  const handlePlayToggle = useCallback(
    () => store.setIsPlaying?.(!store.isPlaying),
    [store]
  );

  const handleThumbnailsChange = useCallback(
    (m: Record<string, string>) =>
      store.setThumbnails
        ? store.setThumbnails((prev) => ({ ...(prev || {}), ...m }))
        : undefined,
    [store]
  );

  // If you want to derive these for PreviewWindow from tracks instead of using
  // `clips`/`graphics` in the store, keep this memo; otherwise you can remove it.
  const { animationClips, graphicClips } = useMemo(() => {
    const all = tracks.flatMap((t) => t.clips ?? []);
    const animationClips: TimelineClip[] = all.filter(
      (c: any): c is TimelineClip => typeof c?.animationId === "string"
    );
    const graphicClips: GraphicTimelineClip[] = all.filter(
      (c: any): c is GraphicTimelineClip =>
        typeof c?.graphicId === "string" || c?.type === "text"
    );
    return { animationClips, graphicClips };
  }, [tracks]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Anim Arrange</h1>
        <ProjectIOButtons />
      </div>

      <PreviewWindow
        tracks={tracks}
        backgroundTracks={backgroundTracks}
        audioTracks={audioTracks}
        // Use clips/graphics from store; if you prefer derived values, swap these:
        // clips={animationClips}
        // graphics={graphicClips}
        clips={clips}
        graphics={graphics}
        currentTime={currentTime}
        isPlaying={isPlaying}
        customThumbnails={customThumbnails}
      />

      <Timeline
        // These two are controlled by the store elsewhere; pass empty + no-ops
        clips={[]}
        onClipsChange={() => {}}
        graphics={[]}
        onGraphicsChange={() => {}}

        tracks={tracks}
        onTracksChange={handleTracksChange}

        audioTracks={audioTracks}
        onAudioTracksChange={handleAudioTracksChange}

        backgroundTracks={backgroundTracks}
        onBackgroundTracksChange={handleBackgroundTracksChange}

        currentTime={currentTime}
        onTimeChange={store.setCurrentTime}   // was setTime

        isPlaying={isPlaying}
        onPlayToggle={handlePlayToggle}

        customThumbnails={customThumbnails}
        onThumbnailsChange={handleThumbnailsChange}
      />

      {/* Unified Library */}
      <LibraryGallery onThumbnailsChange={handleThumbnailsChange} />
    </div>
  );
};

export default Index;
