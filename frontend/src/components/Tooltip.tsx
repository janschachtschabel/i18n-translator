import type { ReactNode } from 'react'

type Side = 'right' | 'top' | 'bottom' | 'left'

interface TooltipProps {
  children: ReactNode
  text: string
  side?: Side
  className?: string
}

const sideClasses: Record<Side, string> = {
  right:  'left-full ml-2 top-1/2 -translate-y-1/2',
  left:   'right-full mr-2 top-1/2 -translate-y-1/2',
  top:    'bottom-full mb-2 left-1/2 -translate-x-1/2',
  bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
}

export function Tooltip({ children, text, side = 'bottom', className = '' }: TooltipProps) {
  return (
    <div className={`relative group inline-flex ${className}`}>
      {children}
      <div
        className={`absolute z-50 pointer-events-none opacity-0 group-hover:opacity-100
          transition-opacity duration-100 delay-300
          bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg
          ${sideClasses[side]}`}
      >
        {text}
        {/* Arrow */}
        {side === 'right' && (
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        )}
        {side === 'left' && (
          <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900" />
        )}
        {side === 'bottom' && (
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
        )}
        {side === 'top' && (
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        )}
      </div>
    </div>
  )
}
