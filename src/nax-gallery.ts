export const NAX_ATTRIBUTION = {
  author: "u/Carlyone",
  name: "NovelAI Tag Experiments",
  url: "https://nax.moe/",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
} as const;
export const NAX_COLLECTIONS = [
  ["V5", "Artist Tags · Constrained", "danbooru-artist-tags-v5"],
  ["V5", "Artist Tags · Loose", "danbooru-artist-tags-2-v5"],
  ["V5", "Artist Tags · Loose (Male)", "danbooru-artist-tags-male-2-v5"],
  ["V5", "Character Tags", "danbooru-character-tags-v5"],
  ["V5", "Hair Tags", "danbooru-hair-tags-v5"],
  ["V4.5", "Artist Tags · Constrained", "danbooru-artist-tags-v4.5"],
  ["V4.5", "Artist Tags · Loose", "danbooru-artist-tags-2-v4.5"],
  ["V4.5", "Character Tags", "danbooru-character-tags-v4.5"],
  ["V4.5", "Copyright Tags", "danbooru-copyright-tags-v4.5"],
  ["V4.5", "Curated Artists", "artists-v4.5"],
  ["V4.5", "Face Tags", "danbooru-face-tags-v4.5"],
  ["V4.5", "Hair Tags", "danbooru-hair-tags-v4.5"],
  ["V4", "Artist Tags", "danbooru-artist-tags-v4"],
  ["V4", "Character Tags", "danbooru-character-tags-v4"],
  ["V4", "Face Tags", "danbooru-face-tags-v4"],
].map(([model,title,id])=>({model,title,id,url:new URL("?gallery="+id,NAX_ATTRIBUTION.url).href}));

export function searchNaxCollections(query:string){
 const q=query.trim().toLowerCase().slice(0,200);
 return NAX_COLLECTIONS.filter(row=>!q || [row.model,row.title,row.id].some(value=>value.toLowerCase().includes(q)));
}
