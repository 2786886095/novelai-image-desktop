import data from '../shared/gallery-labels.json';
export function galleryLibraryText(language:unknown){return data.ui[String(language) as keyof typeof data.ui]??data.ui['zh-CN'];}
export function localizedGalleryTag(tag:string,_language:unknown){const key=tag.trim().toLowerCase().replaceAll('_',' ');return data.names[key as keyof typeof data.names]?.labels['zh-CN']??tag;}
export function galleryTagQuery(query:string,_language:unknown){const matches=Object.entries(data.names).filter(([,v])=>v.labels['zh-CN']===query.trim());return matches.length===1?matches[0][0]:query;}
