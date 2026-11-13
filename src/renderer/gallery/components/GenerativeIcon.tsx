import React from 'react'

/** Vantage "Generative" glyph: a live waveform running through the aperture ring. */
export const GenerativeIcon: React.FC<{ className?: string; strokeWidth?: number }> = ({ className = 'h-4 w-4', strokeWidth = 1.6 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M4.5 13.2c1.6-3.4 3.3-3.4 4.9 0s3.3 3.4 4.9 0 3.3-3.4 5.2-.6" />
    <path d="M6.2 8.4c1.2-1.3 2.3-1.3 3.4 0" opacity="0.55" />
    <circle cx="16.8" cy="16.4" r="0.6" fill="currentColor" stroke="none" />
  </svg>
)
