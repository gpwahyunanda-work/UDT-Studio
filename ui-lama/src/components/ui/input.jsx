import { cn } from '../../lib/utils.js';
export function Input({ className, ...p }) {
  return <input className={cn('uc:min-h-9 uc:w-full uc:rounded-md uc:border uc:border-muted uc:bg-surface uc:px-3 uc:text-sm', className)} {...p} />;
}
export function Select({ className, children, ...p }) {
  return <select className={cn('uc:min-h-9 uc:rounded-md uc:border uc:border-muted uc:bg-surface uc:px-2 uc:text-sm', className)} {...p}>{children}</select>;
}
