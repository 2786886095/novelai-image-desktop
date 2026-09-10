import { useEffect, useRef, useState } from "react";
import type { TavernCharacter } from "../agent/types";

type Visual = Pick<TavernCharacter["visual"], "negativePrompt" | "stylePrompt">;
export type PromptDraft = { negative: string; style: string };
type Field = keyof PromptDraft;

export function readPromptDraft(visual?: Visual): PromptDraft {
  return { negative: visual?.negativePrompt ?? "", style: visual?.stylePrompt ?? "" };
}

/** Only user-edited fields can be persisted; blank and whitespace are data. */
export function editedPromptPatch(draft: PromptDraft, visual: Visual, dirty: ReadonlySet<Field>): Partial<Visual> {
  const patch: Partial<Visual> = {};
  if (dirty.has("negative") && draft.negative !== visual.negativePrompt) patch.negativePrompt = draft.negative;
  if (dirty.has("style") && draft.style !== visual.stylePrompt) patch.stylePrompt = draft.style;
  return patch;
}

export function useTavernPromptDraft(character: TavernCharacter | undefined, update: (patch: Partial<Visual>) => void) {
  const [draft, setDraft] = useState(() => readPromptDraft(character?.visual));
  const owner = useRef(character?.id);
  const dirty = useRef(new Set<Field>());
  const negative = character?.visual.negativePrompt;
  const style = character?.visual.stylePrompt;
  useEffect(() => {
    if (owner.current !== character?.id) {
      owner.current = character?.id;
      dirty.current.clear();
    }
    const incoming = readPromptDraft(character?.visual);
    setDraft(current => ({
      negative: dirty.current.has("negative") ? current.negative : incoming.negative,
      style: dirty.current.has("style") ? current.style : incoming.style,
    }));
  }, [character?.id, negative, style]);

  const flush = () => {
    if (!character || owner.current !== character.id || !dirty.current.size) return;
    const patch = editedPromptPatch(draft, character.visual, dirty.current);
    dirty.current.clear();
    if (Object.keys(patch).length) update(patch);
  };
  useEffect(() => {
    if (!dirty.current.size || owner.current !== character?.id) return;
    const timer = window.setTimeout(flush, 320);
    return () => window.clearTimeout(timer);
  }, [character?.id, negative, style, draft.negative, draft.style, update]);

  const edit = (field: Field, value: string) => {
    dirty.current.add(field);
    setDraft(current => ({ ...current, [field]: value }));
  };
  return { draft, edit, flush };
}
