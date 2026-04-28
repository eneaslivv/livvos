import React, { useEffect, useState } from 'react';
import { Icons } from '../ui/Icons';
import {
  submitAIFeedback,
  getMyAIFeedback,
  type AIFeedbackRating,
} from '../../lib/ai';

interface AIFeedbackBarProps {
  outputId: string | null;
  className?: string;
  /** Compact: thumbs only, no expanded correction field. */
  compact?: boolean;
  /** Optional callback fired after rating is recorded (e.g. to refresh UI). */
  onRated?: (rating: AIFeedbackRating) => void;
}

export const AIFeedbackBar: React.FC<AIFeedbackBarProps> = ({
  outputId,
  className = '',
  compact = false,
  onRated,
}) => {
  const [rating, setRating] = useState<AIFeedbackRating | null>(null);
  const [correction, setCorrection] = useState('');
  const [showCorrection, setShowCorrection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!outputId) return;
    let active = true;
    getMyAIFeedback(outputId).then((existing) => {
      if (!active || !existing) return;
      setRating(existing.rating);
      setCorrection(existing.correction || '');
    });
    return () => { active = false; };
  }, [outputId]);

  if (!outputId) return null;

  const handleRate = async (newRating: AIFeedbackRating) => {
    if (saving) return;
    setSaving(true);
    const ok = await submitAIFeedback(outputId, newRating, correction);
    setSaving(false);
    if (ok) {
      setRating(newRating);
      setSavedAt(Date.now());
      onRated?.(newRating);
      // Auto-prompt for correction on thumbs down
      if (newRating === -1 && !compact && !correction) {
        setShowCorrection(true);
      }
    }
  };

  const handleSubmitCorrection = async () => {
    if (!rating || saving) return;
    setSaving(true);
    const ok = await submitAIFeedback(outputId, rating, correction);
    setSaving(false);
    if (ok) {
      setSavedAt(Date.now());
      setShowCorrection(false);
    }
  };

  const justSaved = savedAt && Date.now() - savedAt < 3000;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span>Was this helpful?</span>
        <button
          type="button"
          onClick={() => handleRate(1)}
          disabled={saving}
          aria-label="Thumbs up"
          className={`p-1.5 rounded-md transition-colors ${
            rating === 1
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-green-500'
          } disabled:opacity-50`}
        >
          <Icons.ThumbsUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => handleRate(-1)}
          disabled={saving}
          aria-label="Thumbs down"
          className={`p-1.5 rounded-md transition-colors ${
            rating === -1
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500'
          } disabled:opacity-50`}
        >
          <Icons.ThumbsDown size={14} />
        </button>
        {!compact && rating !== null && !showCorrection && (
          <button
            type="button"
            onClick={() => setShowCorrection(true)}
            className="text-xs text-indigo-500 hover:text-indigo-600 ml-1"
          >
            {correction ? 'Edit note' : 'Add note'}
          </button>
        )}
        {justSaved && <span className="text-[10px] text-green-600 dark:text-green-400 ml-auto">Saved</span>}
      </div>

      {!compact && showCorrection && (
        <div className="flex flex-col gap-2 pl-1">
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={2}
            placeholder={rating === -1
              ? 'What was wrong? e.g. "tone too formal", "missed our budget constraint"'
              : 'What worked well? (optional)'}
            className="w-full px-2.5 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCorrection(false)}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitCorrection}
              disabled={saving}
              className="text-xs px-3 py-1 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 disabled:opacity-50"
            >
              Save note
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
