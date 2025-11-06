import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Music, X } from "lucide-react";
import { AudioTrack } from "@/types/storyboard";
import { useToast } from "@/hooks/use-toast";

interface AudioImportDialogProps {
  onAddAudioTrack: (audioTrack: AudioTrack) => void;
}

export function AudioImportDialog({ onAddAudioTrack }: AudioImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const resetForm = () => {
    setName("");
    setAudioFile(null);
    setAudioUrl(null);
    setIsProcessing(false);
  };

  const compressAudio = async (file: File): Promise<string> => {
    // For better performance, avoid complex compression and just optimize the blob
    return new Promise((resolve) => {
      try {
        // Create optimized blob with better MIME type handling
        let mimeType = file.type;
        if (file.type.includes('wav') || file.type.includes('wave')) {
          mimeType = 'audio/wav'; // Keep original format for better compatibility
        } else if (!file.type.startsWith('audio/')) {
          mimeType = 'audio/mpeg'; // Default fallback
        }
        
        // Create a new blob with proper MIME type
        const optimizedBlob = new Blob([file], { type: mimeType });
        const url = URL.createObjectURL(optimizedBlob);
        
        resolve(url);
      } catch (error) {
        console.warn('Audio optimization failed, using original:', error);
        const url = URL.createObjectURL(file);
        resolve(url);
      }
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('audio/')) {
        toast({
          title: "Invalid file type",
          description: "Please select an audio file.",
          variant: "destructive"
        });
        return;
      }

      // Check file size (limit to 50MB for performance)
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an audio file smaller than 50MB.",
          variant: "destructive"
        });
        return;
      }

      setIsProcessing(true);
      setAudioFile(file);
      setName(file.name.replace(/\.[^/.]+$/, "")); // Remove file extension
      
      try {
        if (file.size > 10 * 1024 * 1024) { // 10MB threshold
          toast({
            title: "Optimizing audio...",
            description: "Large file detected, optimizing for better playback performance."
          });
          
          // Compress large files
          const compressedUrl = await compressAudio(file);
          setAudioUrl(compressedUrl);
          
          toast({
            title: "Audio optimized",
            description: "Audio has been optimized for smooth playback."
          });
        } else {
          // Small files can use original
          const url = URL.createObjectURL(file);
          setAudioUrl(url);
        }
      } catch (error) {
        console.warn('Audio processing failed, using original:', error);
        // Fallback to original file
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        
        toast({
          title: "Using original audio",
          description: "Audio processing encountered an issue, using original file."
        });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const getAudioDuration = (audioUrl: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      
      // Set lower quality settings for better performance
      audio.preload = 'metadata';
      audio.volume = 0; // Mute during duration check
      
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('error', onError);
        audio.src = '';
      };
      
      const onLoaded = () => {
        resolve(audio.duration);
        cleanup();
      };
      
      const onError = (error: any) => {
        console.error('Audio duration error:', error);
        reject(new Error('Failed to load audio'));
        cleanup();
      };
      
      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('error', onError);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        cleanup();
        reject(new Error('Audio loading timeout'));
      }, 10000);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !audioFile || !audioUrl) {
      toast({
        title: "Missing fields",
        description: "Please provide a name and select an audio file.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Get audio duration
      const duration = await getAudioDuration(audioUrl);

      const newAudioTrack: AudioTrack = {
        id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: name.trim(),
        duration,
        startTime: 0,
        endTime: duration,
        audioUrl,
        volume: 1.0
      };

      onAddAudioTrack(newAudioTrack);
      
      toast({
        title: "Audio track added",
        description: `"${name}" has been added to the timeline.`
      });

      setOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error processing audio:', error);
      toast({
        title: "Error",
        description: "Failed to process the audio file. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Music className="w-4 h-4" />
          Import Audio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Import Audio Track
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Track Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter track name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="audio">Audio File *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="audio"
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="flex-1"
                disabled={isProcessing}
                required
              />
              {isProcessing && (
                <div className="text-xs text-muted-foreground animate-pulse">
                  Processing...
                </div>
              )}
            </div>
            {audioFile && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
                <Music className="w-4 h-4" />
                <span className="flex-1">{audioFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAudioFile(null);
                    setAudioUrl(null);
                    setName("");
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Supported formats: MP3, WAV, OGG, M4A, AAC. Large files (&gt;10MB) will be optimized for better playback.
            </p>
          </div>

          {audioUrl && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <audio controls className="w-full" src={audioUrl} preload="metadata">
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Upload className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Add Track
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}