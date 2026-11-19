import { CAPSULE_TAXONOMY, localizedCapsuleCategoryName, localizedCapsuleSubgroupName } from "../src/prompt-data";
import {sourceCameraTags} from "./composition-camera-tags";

// Only expand a complete topic name, never a partial word. The values are candidate
// canonical tags, not descriptions: the active pack decides membership and translation.
const byName = new Map<string, Set<string>>();
function add(names: string[], tags: string[]) {
  for (const raw of names) {
    const name=raw.normalize("NFKC").toLowerCase().trim();
    if(!name)continue;
    let set=byName.get(name);
    if(!set){set=new Set();byName.set(name,set);}
    for(const tag of tags)set.add(tag);
  }
}
const locales=["zh-CN","zh-TW","en-US","ja-JP","ko-KR"];
for(const cat of CAPSULE_TAXONOMY) {
  const all=cat.subgroups.flatMap(sub=>sub.tags.map(x=>x.en));
  add([cat.name,...locales.filter(l=>localizedCapsuleCategoryName(cat.name,l)!==localizedCapsuleCategoryName("___",l)).map(l=>localizedCapsuleCategoryName(cat.name,l))],all);
  for(const sub of cat.subgroups) {
    add([sub.name,...locales.filter(l=>localizedCapsuleSubgroupName(sub.name,l)!==localizedCapsuleSubgroupName("___",l)).map(l=>localizedCapsuleSubgroupName(sub.name,l))],sub.tags.map(x=>x.en));
  }
  if(cat.name==="画面构图"){
    add(["构图","構圖","構図","画面构图","畫面構圖","composition","framing","구도"],[...all,...sourceCameraTags]);
  }
}
export function relatedTagsForTopic(foldedQuery:string):ReadonlySet<string>|undefined {
  return byName.get(foldedQuery);
}
