import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';
const v = cva('uc:inline-flex uc:items-center uc:gap-1 uc:rounded uc:px-2 uc:py-0.5 uc:text-xs uc:font-semibold uc:border', {
  variants: { tone: {
    brand: 'uc:bg-brand-soft uc:text-brand-dark uc:border-brand',
    ok: 'uc:bg-green-soft uc:text-green-text uc:border-green-text',
    warn: 'uc:bg-warn-soft uc:text-warn uc:border-warn',
    danger: 'uc:bg-danger-soft uc:text-danger uc:border-danger',
    plain: 'uc:bg-surface uc:text-muted uc:border-muted',
  } }, defaultVariants: { tone: 'plain' },
});
export function Badge({ tone, className, ...p }) { return <span className={cn(v({ tone }), className)} {...p} />; }
