import React from 'react';

/**
 * Editorial folder-shape SVG icon — matches the LIVV OS design bundle.
 * Renders a single-color, color-mixed fill so each folder can adopt
 * its assigned tone (sage / sky / pink / accent / wine).
 *
 * The `color` prop should be a valid CSS color string (hex, rgb, var()).
 */
export const FolderIcon: React.FC<{ color?: string; size?: number }> = ({
  color = '#C4A35A',
  size = 44,
}) => {
  const h = size * (38 / 44);
  return (
    <svg viewBox="0 0 44 38" width={size} height={h} fill="none" aria-hidden="true">
      <path
        d="M2 10c0-2.2 1.8-4 4-4h10l3 3h21c2.2 0 4 1.8 4 4v21c0 2.2-1.8 4-4 4H6c-2.2 0-4-1.8-4-4V10z"
        fill={`color-mix(in oklab, ${color} 22%, #ffffff)`}
        stroke={`color-mix(in oklab, ${color} 38%, transparent)`}
        strokeWidth={0.8}
      />
      <path
        d="M2 13h40v3H2z"
        fill={`color-mix(in oklab, ${color} 30%, transparent)`}
        opacity={0.6}
      />
    </svg>
  );
};

/** Avatar palette used in folder collaborator stacks. */
const AVATAR_PALETTE = ['#C4A35A', '#6DBEDC', '#F1ADD8', '#769268', '#A855F7', '#8B5A2B'];

export function avatarColor(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

/** Returns short 2-letter initials from a name (e.g. "Eneas Aldabe" → "EA"). */
export function initials(name?: string | null): string {
  if (!name) return '·';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Maps a folder/doc identifier to a stable color from the LIVV palette. */
const FOLDER_PALETTE = ['#C4A35A', '#6DBEDC', '#F1ADD8', '#769268', '#8B5A2B', '#5c1d18'];

export function folderColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return FOLDER_PALETTE[Math.abs(hash) % FOLDER_PALETTE.length];
}

/** Maps a file extension to the LIVV palette + status accent color. */
const EXT_COLOR_MAP: Record<string, string> = {
  pdf: '#C2410C',
  doc: '#C4A35A',
  docx: '#C4A35A',
  ppt: '#A855F7',
  pptx: '#A855F7',
  xls: '#769268',
  xlsx: '#769268',
  csv: '#769268',
  txt: '#71717a',
  md: '#3f3f46',
  fig: '#F1ADD8',
  sketch: '#F1ADD8',
  psd: '#226cae',
  ai: '#5c1d18',
  png: '#F1ADD8',
  jpg: '#F1ADD8',
  jpeg: '#F1ADD8',
  gif: '#F1ADD8',
  svg: '#226cae',
  mp4: '#A855F7',
  mov: '#A855F7',
  webm: '#A855F7',
  mp3: '#C4A35A',
  zip: '#8B5A2B',
  rar: '#8B5A2B',
};

export function extColor(ext: string): string {
  return EXT_COLOR_MAP[ext.toLowerCase()] ?? '#71717a';
}
