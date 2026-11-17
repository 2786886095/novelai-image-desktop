import {useEffect, useState} from "react";
import type {TagSuggestion} from "./types";

export function tagPackKey(tag: string) {
  return tag.normalize("NFKC").toLowerCase().replaceAll("_", " ").trim().replace(/\s+/g, " ");
}

export function useTagPackRevision() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("langbai:multilingual-tags-changed", refresh);
    return () => window.removeEventListener("langbai:multilingual-tags-changed", refresh);
  }, []);
  return revision;
}

export function useTagPackLabels(tags: readonly string[]) {
  const key = JSON.stringify([...new Set(tags.map(tagPackKey).filter(Boolean))].slice(0, 512));
  const revision = useTagPackRevision();
  const [result, setResult] = useState<{revision: number; labels: Map<string, TagSuggestion>}>({
    revision: -1, labels: new Map(),
  });
  useEffect(() => {
    let active = true;
    const terms: string[] = JSON.parse(key);
    if (terms.length) {
      void window.naiDesktop?.lookupMultilingualTags?.(terms).then(items => {
        if (active) setResult({revision, labels: new Map(items.map(item => [tagPackKey(item.tag), item]))});
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [key, revision]);
  // Never show old-language labels while a new selected dictionary is loading.
  return result.revision === revision ? result.labels : new Map<string, TagSuggestion>();
}
