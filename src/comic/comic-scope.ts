/** Existing Tag comic data remains at its original keys; the Japanese tool owns separate state. */
export type ComicWorkspaceScope='tag-comic'|'jp-comic';
export const JAPANESE_COMIC_PROJECT_KEY='langbai.jpComic.project.v1';
export const JAPANESE_COMIC_RUN_KEY='langbai.jpComic.run.v1';
export const JAPANESE_COMIC_DRAFT_KEY='langbai.jpComic.composer.v1';
export function comicScopeProjectKey(scope:ComicWorkspaceScope){return scope==='jp-comic'?JAPANESE_COMIC_PROJECT_KEY:'langbai.novelai.tag-comic-project.v2';}
export function comicScopeRunKey(scope:ComicWorkspaceScope){return scope==='jp-comic'?JAPANESE_COMIC_RUN_KEY:'langbai.novelai.tag-comic-run.v1';}
