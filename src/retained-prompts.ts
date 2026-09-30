import {DEFAULT_PARAMS,type AppSettings} from './types';

/** Last edited text is authoritative, including an intentional empty string.
 * Legacy lock snapshots are migration fallbacks, never a second live copy. */
export function retainedPrompts(
 settings: Pick<AppSettings,'lastGenerationState'|'lockStylePrompt'|'lockNegativePrompt'|'savedStylePrompt'|'savedNegativePrompt'>,
 fallback: Pick<typeof DEFAULT_PARAMS,'stylePrompt'|'negativePrompt'> = DEFAULT_PARAMS,
) {
 const last = settings.lastGenerationState?.params;
 return {
  stylePrompt: typeof last?.stylePrompt === 'string' ? last.stylePrompt
   : settings.lockStylePrompt && typeof settings.savedStylePrompt === 'string' ? settings.savedStylePrompt : fallback.stylePrompt,
  negativePrompt: typeof last?.negativePrompt === 'string' ? last.negativePrompt
   : settings.lockNegativePrompt && typeof settings.savedNegativePrompt === 'string' ? settings.savedNegativePrompt : fallback.negativePrompt,
 };
}
