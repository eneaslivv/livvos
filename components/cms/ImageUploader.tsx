import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

const ACCEPTED_TYPES = 'image/*,video/mp4,video/webm,video/quicktime,image/gif';
const isMediaFile = (file: File) =>
  file.type.startsWith('image/') || file.type.startsWith('video/');
const isVideo = (url: string) =>
  /\.(mp4|webm|mov)(\?|$)/i.test(url);

interface ImageUploaderProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  onUpload: (file: File) => Promise<string | null>;
  label?: string;
  compact?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  value,
  onChange,
  onUpload,
  label = 'Image',
  compact = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!isMediaFile(file)) return;
      setIsUploading(true);
      const url = await onUpload(file);
      if (url) onChange(url);
      setIsUploading(false);
    },
    [onUpload, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#09090B]/60">{label}</span>
        {value ? (
          <div className="relative group">
            <img
              src={value}
              alt=""
              className="w-8 h-8 rounded object-cover border border-[#E6E2D8]"
            />
            <button
              onClick={() => onChange(null)}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="w-8 h-8 rounded border border-dashed border-[#E6E2D8] flex items-center justify-center hover:border-[#E8BC59] transition-colors"
          >
            {isUploading ? (
              <div className="w-3 h-3 border border-[#E8BC59] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload size={12} className="text-[#09090B]/40" />
            )}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-[#09090B]/70">{label}</label>
      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-[#E6E2D8]">
          {isVideo(value) ? (
            <video src={value} className="w-full h-32 object-cover" muted loop playsInline />
          ) : (
            <img src={value} alt="" className="w-full h-32 object-cover" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 bg-white/90 rounded-md text-xs font-medium text-[#09090B]"
            >
              Replace
            </button>
            <button
              onClick={() => onChange(null)}
              className="px-3 py-1.5 bg-red-500/90 rounded-md text-xs font-medium text-white"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
            isDragging
              ? 'border-[#E8BC59] bg-[#E8BC59]/5'
              : 'border-[#E6E2D8] hover:border-[#E8BC59]/50'
          }`}
        >
          {isUploading ? (
            <div className="w-6 h-6 border-2 border-[#E8BC59] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <ImageIcon size={20} className="text-[#09090B]/30 mb-2" />
              <span className="text-xs text-[#09090B]/50">
                Drop image or click to upload
              </span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
};
