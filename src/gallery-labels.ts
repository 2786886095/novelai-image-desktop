import data from '../shared/gallery-labels.json';
export function galleryLibraryText(language:unknown){return data.ui[String(language) as keyof typeof data.ui]??data.ui['en-US'];}
export function localizedGalleryTag(tag:string,language:unknown){const key=tag.trim().toLowerCase().replaceAll('_',' ');const entry=data.names[key as keyof typeof data.names];return (entry?.labels as Record<string,string>|undefined)?.[String(language)]??tag;}
export function galleryTagQuery(query:string,language:unknown){const matches=Object.entries(data.names).filter(([,v])=>(v.labels as Record<string,string>)[String(language)]===query.trim());return matches.length===1?matches[0][0]:query;}
