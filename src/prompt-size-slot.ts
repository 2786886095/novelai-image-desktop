import type { ReactNode } from 'react';

/** Tool-specific controls occupy the same post-toolbar, pre-seed slot as generation. */
export function resolvePromptSizeSlot(custom: ReactNode | undefined, standard: ReactNode): ReactNode {
  // undefined preserves the generation/i2i UI; an explicit null hides the slot.
  return custom === undefined ? standard : custom;
}
