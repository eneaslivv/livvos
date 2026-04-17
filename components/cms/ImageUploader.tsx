import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Check, Plus } from 'lucide-react';

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
  multiple?: boolean;
  variant?: 'default' | 'tile';
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  value,
  onChange,
  onUpload,
  label = 'Image',
  compact = false,
  multiple = false,
  variant = 'default',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const valid = Array.from(files).filter(isMediaFile);
      if (valid.length === 0) return;
      const toProcess = multiple ? valid : valid.slice(0, 1);
      setIsUploading(true);
      setJustUploaded(false);
      for (const file of toProcess) {
        const url = await onUpload(file);
        if (url) onChange(url);
      }
      setJustUploaded(true);
      setTimeout(() => setJustUploaded(false), 2500);
      setIsUploading(false);
    },
    [onUpload, onChange, multiple]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) handleFiles(e.target.files);
      e.target.value = '';
    },
    [handleFiles]
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
          multiple={multiple}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    );
  }

  if (variant === 'tile') {
    return (
      <>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`group relative flex flex-col items-center justify-center gap-1 h-full min-h-[104px] rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
            isDragging
              ? 'border-[#E8BC59] bg-[#E8BC59]/10'
              : 'border-[#E6E2D8] bg-[#FDFBF7] hover:border-[#E8BC59]/50 hover:bg-[#E8BC59]/5'
          }`}
        >
          {isUploading ? (
            <div className="w-4 h-4 border-2 border-[#E8BC59] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-white border border-[#E6E2D8] flex items-center justify-center group-hover:border-[#E8BC59]/60 transition-colors">
                <Plus size={14} className="text-[#09090B]/50 group-hover:text-[#E8BC59]" />
              </div>
              <span className="text-[10px] text-[#09090B]/50 group-hover:text-[#09090B]/70">
                {label === 'Image' ? 'Add media' : label}
              </span>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple={multiple}
          className="hidden"
          onChange={handleInputChange}
        />
      </>
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
          ) : justUploaded ? (
            <div className="flex flex-col items-center gap-1">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                <Check size={16} className="text-green-600" />
              </div>
              <span className="text-xs text-green-600 font-medium">Uploaded</span>
            </div>
          ) : (
            <>
              <ImageIcon size={20} className="text-[#09090B]/30 mb-2" />
              <span className="text-xs text-[#09090B]/50">
                {multiple ? 'Drop files or click to upload' : 'Drop image or click to upload'}
              </span>
              {multiple && (
                <span className="text-[10px] text-[#09090B]/30 mt-0.5">
                  Images, videos, or GIFs — multiple allowed
                </span>
              )}
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple={multiple}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
};
