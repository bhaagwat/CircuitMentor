import React from 'react';

export interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  size?: number;
  showText?: boolean;
  src?: string;
}

/**
 * Unified CircuitMentor Logo Component.
 * References the single SVG logo mark at /circuitmentor-logo-mark.svg in the public folder.
 */
export function CircuitMentorLogo({
  className = '',
  size = 28,
  showText = false,
  src = '/circuitmentor-logo-mark.svg',
  ...props
}: LogoProps) {
  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      {...props}
    >
      <img
        src={src}
        alt="CircuitMentor Logo"
        width={size}
        height={size}
        className="shrink-0 object-contain pointer-events-none"
        style={{ width: `${size}px`, height: `${size}px` }}
      />

      {showText && (
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight text-[#F5F5F7] leading-none">
            CircuitMentor
          </span>
          <span className="text-[10px] text-[#86868B] tracking-wide mt-0.5 font-mono">
            Lab Bench
          </span>
        </div>
      )}
    </div>
  );
}

export const Logo = CircuitMentorLogo;
export default CircuitMentorLogo;
