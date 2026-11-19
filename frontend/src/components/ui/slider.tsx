import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: number;
  onValueChange?: (val: number) => void;
}

export function Slider({ className, min = 0, max = 100, step = 1, value, onValueChange, ...props }: SliderProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange?.(parseFloat(e.target.value))}
      className={cn(
        'w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none focus:ring-1 focus:ring-primary',
        className
      )}
      {...props}
    />
  );
}
