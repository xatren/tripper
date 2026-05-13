'use client';

import { useCallback, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PhotoUploadProps {
  tripId: string;
  pinId: string;
  onUploaded: (url: string, storagePath: string) => void;
}

export function PhotoUpload({ tripId, pinId, onUploaded }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError('Only image files are supported');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File must be under 10MB');
        return;
      }

      setUploading(true);
      setError(null);

      const ext = file.name.split('.').pop();
      const path = `trip-photos/${tripId}/${pinId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('trip-photos')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }

      const { data } = supabase.storage.from('trip-photos').getPublicUrl(path);
      onUploaded(data.publicUrl, path);
      setUploading(false);
    },
    [tripId, pinId, supabase, onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  return (
    <div className="space-y-2">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-xl p-6 text-center cursor-pointer transition-colors group"
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl group-hover:scale-110 transition-transform">📷</span>
            <p className="text-slate-400 text-sm">
              Drop photo here or <span className="text-amber-400">browse</span>
            </p>
            <p className="text-slate-600 text-xs">PNG, JPG, WebP up to 10MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
