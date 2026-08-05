import React from 'react'

interface ApertureIrisIconProps {
  className?: string
  animating?: boolean
}

export const ApertureIrisIcon: React.FC<ApertureIrisIconProps> = ({
  className = 'w-5 h-5 text-glow',
  animating = false
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${animating ? 'animate-spin-slow' : ''}`}
      style={{ animationDuration: '8s' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3L16 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19.8 7.5L12 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19.8 16.5L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 21L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.2 16.5L12 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.2 7.5L15 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
