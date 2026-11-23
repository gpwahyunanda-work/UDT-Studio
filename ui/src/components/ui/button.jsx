import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';
// Gaya shadcn/ui (cva), awalan Tailwind "uc:".
const v = cva('uc:inline-flex uc:items-center uc:gap-2 uc:rounded-md uc:text-sm uc:font-medium uc:cursor-pointer uc:min-h-9 uc:px-3 uc:border uc:disabled:opacity-50', {
  variants: { variant: {
    primary: 'uc:bg-brand uc:text-white uc:border-brand uc:hover:bg-brand-dark',
    outline: 'uc:bg-surface uc:text-brand uc:border-brand uc:hover:bg-brand-soft',
    ghost: 'uc:bg-transparent uc:text-brand uc:border-transparent uc:hover:bg-brand-soft',
  } },
  defaultVariants: { variant: 'outline' },
});
export function Button({ className, variant, ...p }) { return <button type="button" className={cn(v({ variant }), className)} {...p} />; }
