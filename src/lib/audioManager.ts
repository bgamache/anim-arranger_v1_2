import { AudioTrack } from "@/types/storyboard";

interface AudioBuffer {
  audio: HTMLAudioElement;
  isReady: boolean;
  isLoading: boolean;
  duration: number;
  lastUsed: number;
  // NEW: WebAudio source node for this media element (so we can mix all audio)
  source?: MediaElementAudioSourceNode;
}

class AudioManager {
  private audioCache = new Map<string, AudioBuffer>();
  private maxCacheSize = 10; // Limit cache to prevent memory issues

  // NEW: Lazy WebAudio mix bus (created on demand)
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Create context/master if missing; wire global hooks for exporter. */
  private ensureContext() {
    if (this.ctx && this.master) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    // Expose hooks so exporter can find a mixed audio stream
    try {
      (window as any).__aaGetAudioContext = () => this.ctx;
      (window as any).__aaGetMasterNode = () => this.master;
      (window as any).__aaGetAudioStream = () => this.getAudioStream();
    } catch {
      /* ignore (SSR) */
    }
  }

  /** Best-effort: return a mixed MediaStream of everything routed to master. */
  public getAudioStream(): MediaStream | null {
    if (!this.ctx || !this.master) return null;
    try {
      const dest = this.ctx.createMediaStreamDestination();
      this.master.connect(dest);
      return dest.stream;
    } catch {
      return null;
    }
  }

  async preloadAudio(track: AudioTrack): Promise<HTMLAudioElement> {
    // Check if already cached and ready
    const cached = this.audioCache.get(track.id);
    if (cached?.isReady) {
      cached.lastUsed = Date.now();
      return cached.audio;
    }

    // If loading, wait for it
    if (cached?.isLoading) {
      return new Promise((resolve, reject) => {
        const checkReady = () => {
          const current = this.audioCache.get(track.id);
          if (current?.isReady) {
            resolve(current.audio);
          } else if (!current?.isLoading) {
            reject(new Error("Audio loading failed"));
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
    }

    // Create new audio element
    const audio = new Audio();
    const buffer: AudioBuffer = {
      audio,
      isReady: false,
      isLoading: true,
      duration: track.duration,
      lastUsed: Date.now(),
    };

    this.audioCache.set(track.id, buffer);
    this.cleanupOldEntries();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        buffer.isLoading = false;
        reject(new Error("Audio loading timeout"));
      }, 10000);

      const onCanPlayThrough = () => {
        clearTimeout(timeout);
        buffer.isReady = true;
        buffer.isLoading = false;
        audio.removeEventListener("canplaythrough", onCanPlayThrough);
        audio.removeEventListener("error", onError);
        console.log("Audio cached:", track.name);

        // NEW: Once playable, ensure WebAudio graph exists and connect this element
        try {
          this.ensureContext();
          if (this.ctx && this.master && !buffer.source) {
            // Important: a media element can be wrapped by createMediaElementSource only once
            buffer.source = this.ctx.createMediaElementSource(audio);
            buffer.source.connect(this.master);
          }
        } catch (err) {
          console.warn("Audio graph connect error:", err);
        }

        resolve(audio);
      };

      const onError = (e: Event) => {
        clearTimeout(timeout);
        buffer.isLoading = false;
        audio.removeEventListener("canplaythrough", onCanPlayThrough);
        audio.removeEventListener("error", onError);
        // disconnect any partially created source
        try {
          buffer.source?.disconnect();
        } catch { /* ignore */ }
        this.audioCache.delete(track.id);
        console.error("Audio cache error for", track.name, e);
        reject(new Error("Audio loading failed"));
      };

      audio.addEventListener("canplaythrough", onCanPlayThrough);
      audio.addEventListener("error", onError);

      // Configure audio for optimal performance
      audio.preload = "auto";
      audio.volume = 0.8;
      audio.crossOrigin = "anonymous";

      // Set source last to trigger loading
      audio.src = track.audioUrl;
    });
  }

  getAudio(trackId: string): HTMLAudioElement | null {
    const buffer = this.audioCache.get(trackId);
    if (buffer?.isReady) {
      buffer.lastUsed = Date.now();
      return buffer.audio;
    }
    return null;
  }

  async resumeContextIfSuspended() {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch { /* ignore */ }
    }
  }

  syncAudio(
    trackId: string,
    currentTime: number,
    isPlaying: boolean,
    trackStartTime: number,
    trackEndTime: number
  ): void {
    const buffer = this.audioCache.get(trackId);
    if (!buffer?.isReady) return;

    const audio = buffer.audio;
    const isTrackActive = currentTime >= trackStartTime && currentTime <= trackEndTime;
    const trackTime = Math.max(0, currentTime - trackStartTime);

    if (isPlaying && isTrackActive) {
      // Keep WebAudio alive, avoids muted/blocked context on user gesture rules
      this.resumeContextIfSuspended().catch(() => {});

      // Use larger tolerance to reduce seeking frequency
      const syncTolerance = 0.2;
      const timeDiff = Math.abs(audio.currentTime - trackTime);

      // Only seek if really necessary and not too close to avoid stuttering
      if (timeDiff > syncTolerance && trackTime > 0.1) {
        try {
          audio.currentTime = trackTime;
        } catch (error) {
          console.warn("Audio sync error:", error);
        }
      }

      if (audio.paused) {
        audio.play().catch((error) => {
          console.warn("Audio play error:", error);
        });
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
    }
  }

  pauseAll(): void {
    this.audioCache.forEach((buffer) => {
      if (buffer.isReady && !buffer.audio.paused) {
        buffer.audio.pause();
      }
    });
  }

  removeTrack(trackId: string): void {
    const buffer = this.audioCache.get(trackId);
    if (buffer) {
      try {
        buffer.source?.disconnect();
      } catch { /* ignore */ }
      buffer.audio.pause();
      buffer.audio.src = "";
      this.audioCache.delete(trackId);
    }
  }

  private cleanupOldEntries(): void {
    if (this.audioCache.size <= this.maxCacheSize) return;

    // Remove least recently used entries
    const entries = Array.from(this.audioCache.entries()).sort(
      ([, a], [, b]) => a.lastUsed - b.lastUsed
    );

    const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
    toRemove.forEach(([trackId, buffer]) => {
      try {
        buffer.source?.disconnect();
      } catch { /* ignore */ }
      buffer.audio.pause();
      buffer.audio.src = "";
      this.audioCache.delete(trackId);
    });
  }

  destroy(): void {
    this.audioCache.forEach((buffer) => {
      try {
        buffer.source?.disconnect();
      } catch { /* ignore */ }
      buffer.audio.pause();
      buffer.audio.src = "";
    });
    this.audioCache.clear();
    try {
      this.master?.disconnect();
    } catch { /* ignore */ }
    // Do not close context here; browser policies vary and you might reuse it.
  }
}

// Export singleton instance
export const audioManager = new AudioManager();

/** Optional named helpers (kept for compatibility with earlier guidance) */
export function __aaGetAudioContext(): AudioContext | null {
  return (window as any).__aaGetAudioContext?.() ?? null;
}
export function __aaGetMasterNode(): AudioNode | null {
  return (window as any).__aaGetMasterNode?.() ?? null;
}
export function __aaGetAudioStream(): MediaStream | null {
  return (window as any).__aaGetAudioStream?.() ?? null;
}
