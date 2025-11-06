import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type {
  TimelineClip,
  AudioTrack,
  BackgroundTrack,
  GraphicTimelineClip,
} from "@/types/storyboard";

/**
 * If you already have a Track type elsewhere, import it.
 * Otherwise this light interface will work for the store and PreviewWindow.
 */
export interface Track {
  id: string;
  name: string;
  clips: any[]; // can be TimelineClip | GraphicTimelineClip | Background-like clips
  isBackground?: boolean;
  type?: string; // e.g., "background"
}

/** What the app will read from context */
export interface TimelineContextValue {
  // timeline state
  tracks: Track[];
  clips: TimelineClip[];
  graphics: GraphicTimelineClip[];
  audioTracks: AudioTrack[];
  backgroundTracks: BackgroundTrack[];

  // playback state
  currentTime: number;
  isPlaying: boolean;

  // thumbnails used by galleries/preview
  customThumbnails: Record<string, string>;

  // setters
  setTracks: (t: Track[]) => void;
  setClips: (c: TimelineClip[]) => void;
  setGraphics: (g: GraphicTimelineClip[]) => void;
  setAudioTracks: (a: AudioTrack[]) => void;
  setBackgroundTracks: (b: BackgroundTrack[]) => void;
  setCurrentTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  setThumbnails: (fnOrMap: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
}

// Create context
const TimelineContext = createContext<TimelineContextValue | undefined>(undefined);

/** Provider with minimal, stable state management */
export const TimelineProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  // core timeline groups
  const [tracks, setTracksState] = useState<Track[]>([]);
  const [clips, setClipsState] = useState<TimelineClip[]>([]);
  const [graphics, setGraphicsState] = useState<GraphicTimelineClip[]>([]);
  const [audioTracks, setAudioTracksState] = useState<AudioTrack[]>([]);
  const [backgroundTracks, setBackgroundTracksState] = useState<BackgroundTrack[]>([]);

  // transport
  const [currentTime, setCurrentTimeState] = useState<number>(0);
  const [isPlaying, setIsPlayingState] = useState<boolean>(false);

  // thumbnails map
  const [customThumbnails, setCustomThumbnails] = useState<Record<string, string>>({});

  // stable setters (typed)
  const setTracks = useCallback((t: Track[]) => setTracksState(t), []);
  const setClips = useCallback((c: TimelineClip[]) => setClipsState(c), []);
  const setGraphics = useCallback((g: GraphicTimelineClip[]) => setGraphicsState(g), []);
  const setAudioTracks = useCallback((a: AudioTrack[]) => setAudioTracksState(a), []);
  const setBackgroundTracks = useCallback((b: BackgroundTrack[]) => setBackgroundTracksState(b), []);
  const setCurrentTime = useCallback((t: number) => setCurrentTimeState(t), []);
  const setIsPlaying = useCallback((p: boolean) => setIsPlayingState(p), []);

  /**
   * setThumbnails accepts either a full map or an updater function(prev)=>next,
   * so you can safely do: setThumbnails(prev => ({...prev, [id]: url}))
   */
  const setThumbnails = useCallback(
    (fnOrMap: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
      if (typeof fnOrMap === "function") {
        setCustomThumbnails((prev) => (fnOrMap as (p: Record<string, string>) => Record<string, string>)(prev));
      } else {
        setCustomThumbnails(fnOrMap || {});
      }
    },
    []
  );

  const value = useMemo<TimelineContextValue>(
    () => ({
      tracks,
      clips,
      graphics,
      audioTracks,
      backgroundTracks,
      currentTime,
      isPlaying,
      customThumbnails,
      setTracks,
      setClips,
      setGraphics,
      setAudioTracks,
      setBackgroundTracks,
      setCurrentTime,
      setIsPlaying,
      setThumbnails,
    }),
    [
      tracks,
      clips,
      graphics,
      audioTracks,
      backgroundTracks,
      currentTime,
      isPlaying,
      customThumbnails,
      setTracks,
      setClips,
      setGraphics,
      setAudioTracks,
      setBackgroundTracks,
      setCurrentTime,
      setIsPlaying,
      setThumbnails,
    ]
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
};

/** Hook to use the store */
export function useTimelineStore(): TimelineContextValue {
  const ctx = useContext(TimelineContext);
  if (!ctx) {
    throw new Error("useTimelineStore must be used within a TimelineProvider");
  }
  return ctx;
}
