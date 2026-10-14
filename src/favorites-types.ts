export interface ImageFavorite {
  id: string; sha256: string; filePath: string; fileUrl?: string;
  prefix: string; name: string; extension: string;
  width: number; height: number; savedAt: string; missing?: boolean;
  /** Recorded local generation completion, not the official server's exact epoch. */
  generatedAt?: string;
  generatedAtSource?: 'local-completion';
  generatedAtHistoryId?: string;
}
export interface ImageFavoriteLibrary { directory: string; items: ImageFavorite[]; }
