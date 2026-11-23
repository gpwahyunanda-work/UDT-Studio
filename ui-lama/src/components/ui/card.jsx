import { cn } from '../../lib/utils.js';
export function Card({ className, ...p }) { return <section className={cn('uc:rounded-lg uc:border uc:border-line uc:bg-surface uc:p-4', className)} {...p} />; }
