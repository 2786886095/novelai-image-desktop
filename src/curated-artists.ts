import type { ArtistTagRecord } from "./artist-lab";

/**
 * Canonical Danbooru artist candidates jointly reviewed on 2026-08-22.
 * Inclusion proves a current, non-deprecated category-1 tag with >=100 posts;
 * it does not claim NovelAI V5 familiarity or subjective quality.
 */
export const CURATED_ARTIST_TAGS: readonly ArtistTagRecord[] = [
  { id: 1452150, name: "beijuu", postCount: 718, deprecated: false },
  { id: 1597669, name: "yd_(orange_maru)", postCount: 1868, deprecated: false },
  { id: 1443658, name: "ohisashiburi", postCount: 1730, deprecated: false },
  { id: 592669, name: "nonco", postCount: 1052, deprecated: false },
  { id: 1710191, name: "yutokamizu", postCount: 256, deprecated: false },
  { id: 1862751, name: "mx2j", postCount: 819, deprecated: false },
  { id: 2137707, name: "doremi_(doremi4704)", postCount: 833, deprecated: false },
  { id: 1585283, name: "miv4t", postCount: 277, deprecated: false },
  { id: 630083, name: "yoneyama_mai", postCount: 322, deprecated: false },
  { id: 1633876, name: "binggong_asylum", postCount: 346, deprecated: false },
  { id: 1521123, name: "pottsness", postCount: 706, deprecated: false },
  { id: 1423458, name: "mochizuki_kei", postCount: 705, deprecated: false },
  { id: 1675669, name: "quasarcake", postCount: 375, deprecated: false },
  { id: 656206, name: "ogipote", postCount: 550, deprecated: false },
  { id: 1372041, name: "kieed", postCount: 462, deprecated: false },
  { id: 382437, name: "happoubi_jin", postCount: 1458, deprecated: false },
  { id: 1540993, name: "haruyuki_(gffewuoutgblubh)", postCount: 572, deprecated: false },
  { id: 1874056, name: "umehara_sei", postCount: 241, deprecated: false },
  { id: 382278, name: "onineko", postCount: 387, deprecated: false },
  { id: 659788, name: "pochi_(pochi-goya)", postCount: 762, deprecated: false },
  { id: 1762579, name: "puuzaki_puuna", postCount: 622, deprecated: false },
  { id: 1602954, name: "noyu_(noyu23386566)", postCount: 295, deprecated: false },
  { id: 1315266, name: "kouyafu", postCount: 231, deprecated: false },
  { id: 1823689, name: "kita_(kitairoha)", postCount: 455, deprecated: false },
  { id: 2221030, name: "channel_(caststation)", postCount: 243, deprecated: false },
  { id: 1354609, name: "jyt", postCount: 837, deprecated: false },
  { id: 2235680, name: "machi_(machi0910)", postCount: 825, deprecated: false },
  { id: 1514664, name: "omone_hokoma_agm", postCount: 951, deprecated: false },
  { id: 643210, name: "marisasu_(marisa0904)", postCount: 435, deprecated: false },
  { id: 1486086, name: "fantongjun", postCount: 482, deprecated: false },
  { id: 382485, name: "rikudou_inuhiko", postCount: 385, deprecated: false },
  { id: 1756304, name: "oryo_(oryo04)", postCount: 1526, deprecated: false },
  { id: 1531418, name: "tokkyu", postCount: 565, deprecated: false },
] as const;

export const ARTIST_TAG_ALIASES: Readonly<Record<string, string>> = {
  "channel_(_caststation)": "channel_(caststation)",
  "machi_(7769)": "machi_(machi0910)",
};
