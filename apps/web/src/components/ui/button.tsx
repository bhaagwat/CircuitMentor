import * as React from 'react';
import { cn, cva, type VariantProps } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-[13px] font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.985] cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:
          'btn-accent-blue',
        accent:
          'btn-accent-blue',
        destructive:
          'bg-[var(--cm-error)] text-[#FFFFFF] hover:bg-opacity-90',
        outline:
          'border border-[var(--cm-line)] bg-[var(--cm-raised)] text-[var(--cm-text)] hover:bg-[var(--cm-hover)] hover:border-[var(--cm-line-strong)]',
        secondary:
          'bg-[var(--cm-raised)] text-[var(--cm-text)] hover:bg-[var(--cm-hover)]',
        ghost:
          'hover:bg-[var(--cm-hover)] text-[var(--cm-text-secondary)] hover:text-[var(--cm-text)] shadow-none',
        link: 'text-[var(--cm-blue)] underline-offset-4 hover:underline shadow-none',
        glass:
          'bg-[var(--glass-fill)] backdrop-blur-[20px] saturate-[160%] border border-[var(--glass-stroke)] text-[var(--cm-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_32px_rgba(0,0,0,0.5)] hover:bg-[var(--cm-hover)]',
      },
      size: {
        default: 'h-9 px-4 py-1.5 text-xs',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-6 text-sm',
        icon: 'h-8 w-8 rounded-xl',
        pill: 'h-8 rounded-full px-4 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
