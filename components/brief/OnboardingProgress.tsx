/**
 * OnboardingProgress — minimal stepper that shows which onboarding
 * steps have been completed. Rendered inline in the chat when the
 * AI is guiding the user through client/project/task setup.
 *
 * Purely presentational — the parent decides which steps exist and
 * their status. This just paints them in the LIVV design language.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../ui/Icons';
import { SPRING_ENTER } from '../../lib/ui/motion';

export interface OnboardingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done';
  /** Name of the created record (e.g. "Sunnyside Agency") */
  value?: string;
}

interface OnboardingProgressProps {
  steps: OnboardingStep[];
  title?: string;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  steps,
  title = 'Setting up',
}) => {
  const doneCount = steps.filter(s => s.status === 'done').length;
  const activeStep = steps.find(s => s.status === 'active');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_ENTER}
      style={{
        borderRadius: 14,
        border: '1px solid var(--os-border, rgba(214,209,199,0.5))',
        background: 'var(--os-panel, #FFFFFF)',
        padding: '14px 16px',
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
      }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          background: 'var(--accent-soft, rgba(196,163,90,0.10))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icons.Sparkles size={12} style={{ color: 'var(--accent, #C4A35A)' }} />
        </div>
        <div>
          <div style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: 9,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.16em',
            color: 'var(--os-fg-3, #A1A1AA)',
          }}>
            {title}
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--os-fg-2, #71717A)',
            marginTop: 1,
          }}>
            {doneCount} of {steps.length} complete
            {activeStep ? ` · ${activeStep.label}` : ''}
          </div>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((step, i) => (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 0',
            }}
          >
            {/* Step indicator */}
            <div style={{
              width: 20,
              height: 20,
              borderRadius: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...(step.status === 'done' ? {
                background: 'rgba(118,146,104,0.15)',
                color: 'var(--sage, #769268)',
              } : step.status === 'active' ? {
                background: 'var(--accent-soft, rgba(196,163,90,0.12))',
                color: 'var(--accent, #C4A35A)',
                boxShadow: '0 0 0 2px rgba(196,163,90,0.2)',
              } : {
                background: 'var(--os-surface, #F4F4F5)',
                color: 'var(--os-fg-3, #A1A1AA)',
              }),
            }}>
              {step.status === 'done' ? (
                <Icons.Check size={10} />
              ) : step.status === 'active' ? (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Icons.Circle size={6} style={{ fill: 'currentColor' }} />
                </motion.div>
              ) : (
                <span style={{
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}>{i + 1}</span>
              )}
            </div>

            {/* Step label + value */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: step.status === 'active' ? 500 : 400,
                color: step.status === 'pending'
                  ? 'var(--os-fg-3, #A1A1AA)'
                  : 'var(--os-fg-1, #3F3F46)',
                lineHeight: 1.3,
              }}>
                {step.label}
              </div>
              {step.value && step.status === 'done' && (
                <div style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--sage, #769268)',
                  marginTop: 1,
                }}>
                  {step.value}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
