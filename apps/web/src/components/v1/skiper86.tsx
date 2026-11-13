'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AppleBorderGradientProps extends React.HTMLAttributes<HTMLDivElement> {
  isActive?: boolean;
  preview?: boolean;
  intensity?: 'sm' | 'md' | 'lg' | 'xl';
  speed?: number;
  borderWidth?: number;
  glow?: boolean;
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

const intensityMap = {
  sm: { blur: 'blur(8px)', opacity: 0.45 },
  md: { blur: 'blur(14px)', opacity: 0.7 },
  lg: { blur: 'blur(22px)', opacity: 0.85 },
  xl: { blur: 'blur(30px)', opacity: 0.95 },
};

/**
 * Skiper UI skiper86: Apple AI Gradient (AppleBorderGradient)
 * High-fidelity Apple Intelligence iridescent rotating border gradient.
 */
export function AppleBorderGradient({
  isActive = false,
  preview = false,
  intensity = 'md',
  speed = 6,
  borderWidth = 2,
  glow = true,
  children,
  className = '',
  containerClassName = '',
  style,
  ...props
}: AppleBorderGradientProps) {
  const active = isActive || preview;
  const currentIntensity = intensityMap[intensity] || intensityMap.md;

  // Apple Intelligence blue hues rotating conic gradient
  const gradientConic =
    'conic-gradient(from 0deg at 50% 50%, #0071E3 0deg, #2997FF 45deg, #64D2FF 90deg, #BAE6FD 135deg, #38BDF8 180deg, #0284C7 225deg, #0056B3 270deg, #2997FF 315deg, #0071E3 360deg)';

  // If children are provided, act as container wrapper
  if (children) {
    return (
      <div
        className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${containerClassName}`}
        style={style}
        {...props}
      >
        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
            >
              {/* Outer ambient glow */}
              {glow && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: speed * 1.25,
                    ease: 'linear',
                  }}
                  className="absolute -inset-[50%] rounded-[inherit]"
                  style={{
                    background: gradientConic,
                    filter: currentIntensity.blur,
                    opacity: currentIntensity.opacity,
                    willChange: 'transform',
                  }}
                />
              )}

              {/* Rotating perimeter gradient */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Infinity,
                  duration: speed,
                  ease: 'linear',
                }}
                className="absolute -inset-[50%] rounded-[inherit]"
                style={{
                  background: gradientConic,
                  willChange: 'transform',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content surface */}
        <div
          className={`relative z-10 w-full h-full rounded-[inherit] transition-all duration-300 ${className}`}
          style={
            active
              ? {
                  margin: `${borderWidth}px`,
                  width: `calc(100% - ${borderWidth * 2}px)`,
                  height: `calc(100% - ${borderWidth * 2}px)`,
                }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    );
  }

  // If no children provided, render as a self-contained border frame overlay
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 rounded-[inherit] overflow-hidden ${className}`}
      style={style}
      {...props}
    >
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 rounded-[inherit] overflow-hidden"
          >
            {/* Ambient diffuse iridescent aura */}
            {glow && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Infinity,
                  duration: speed * 1.3,
                  ease: 'linear',
                }}
                className="absolute -inset-[60%]"
                style={{
                  background: gradientConic,
                  filter: currentIntensity.blur,
                  opacity: currentIntensity.opacity,
                  mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  maskComposite: 'exclude',
                  WebkitMaskComposite: 'xor',
                  padding: `${borderWidth + 2}px`,
                  willChange: 'transform',
                }}
              />
            )}

            {/* Sharp rotating border ribbon */}
            <div
              className="absolute inset-0 rounded-[inherit]"
              style={{
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
                WebkitMaskComposite: 'xor',
                padding: `${borderWidth}px`,
              }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Infinity,
                  duration: speed,
                  ease: 'linear',
                }}
                className="absolute -inset-[100%]"
                style={{
                  background: gradientConic,
                  willChange: 'transform',
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const Skiper86 = AppleBorderGradient;
export default AppleBorderGradient;
