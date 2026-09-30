export interface ImageFavorite {
  id: string; sha256: string; filePath: string; fileUrl?: string;
  prefix: string; name: string; extension: string;
  width: number; height: number; savedAt: string; missing?: boolean;
}
export interface ImageFavoriteLibrary { directory: string; items: ImageFavorite[]; }
