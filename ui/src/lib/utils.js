import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
const twMerge = extendTailwindMerge({ prefix: 'uc' });
export const cn = (...a) => twMerge(clsx(a));
