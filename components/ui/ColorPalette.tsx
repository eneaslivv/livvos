import React from 'react'
import { X } from 'lucide-react'

export const COLOR_PRESETS = [
  '#2C0405', // noir
  '#7A2E3B', // berry
  '#C45B3E', // terracotta
  '#D4956A', // apricot
  '#E8C87A', // gold
  '#6B7A3D', // olive
  '#3D6B5C', // forest
  '#4A5D7A', // slate
  '#8B6B8A', // mauve
  '#A08070', // taupe
] as const

export const colorToBg = (hex: string, alpha = 0.12): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const getContrastText = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff'
}

interface ColorPaletteProps {
  value: string | null | undefined
  onChange: (color: string | null) => void
  label?: string
  allowClear?: boolean
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({
  value, onChange, label = 'Color', allowClear = true
}) => {
  return (
    <div>
      {label && (
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {allowClear && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              !value
                ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-800'
                : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:border-zinc-300'
            }`}
            title="Sin color"
          >
            <X size={10} className="text-zinc-400" />
          </button>
        )}
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={`w-6 h-6 rounded-full transition-all ${
              value === color
                ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 scale-110'
                : 'hover:scale-110'
            }`}
            style={{
              backgroundColor: color,
              ...(value === color ? { ringColor: color } : {}),
            }}
            title={color}
          />
        ))}
      </div>
    </div>
  )
}
