import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("online gallery pagination and adaptive previews", () => {
  it("uses bounded numeric page inputs instead of materializing page option lists", () => {
    const gallery = read("src/AitagGallery.tsx");
    const catalog = read("src/ReferenceCatalogPanel.tsx");

    expect(gallery).toContain("const GALLERY_PAGE_SIZE_OPTIONS = [12, 24, 48, 60]");
    expect(gallery).toContain("const DEFAULT_GALLERY_PAGE_SIZE = 12");
    expect(gallery).toContain("(page - 1) * pageSize");
    expect(gallery).toContain('className="aitag-pagination artist-ranking-pagination"');
    expect(gallery.match(/<GalleryPageNumberInput/g)?.length).toBeGreaterThanOrEqual(4);
    expect(gallery).toContain("pageCount={maxPage}");
    expect(gallery).not.toContain("numberedPageOptions");
    expect(gallery).not.toContain('className="gallery-page-picker');
    expect(catalog).toContain("const CATALOG_PAGE_SIZE_OPTIONS = [12, 24, 48, 60]");
    expect(catalog).toContain("const DEFAULT_CATALOG_PAGE_SIZE = 12");
    expect(catalog).toContain("(page - 1) * pageSize");
    expect(catalog).toContain('className="aitag-pagination reference-catalog-pagination"');
    expect(catalog).toContain("<CatalogPageNumberInput");
    expect(catalog).toContain("pageCount={pageCount}");
    expect(catalog).toContain('langbai.reference-catalog.page-size.v1');
    expect(catalog).not.toContain('className="reference-catalog-page-picker"');
    expect(read("src/styles.css")).toMatch(/\.gallery-page-number-input \.reference-ui-btn[^}]*justify-content:\s*center/);
    expect(`${gallery}\n${catalog}`).not.toMatch(/加载更多|setVisibleCount|artist-ranking-more|reference-catalog-more/);
  });

  it("keeps the current catalog page visible while target thumbnails preload", () => {
    const catalog = read("src/ReferenceCatalogPanel.tsx");

    expect(catalog).toContain("const [pendingPage, setPendingPage]");
    expect(catalog).toContain("await Promise.allSettled(nextAssets.map");
    expect(catalog.indexOf("await Promise.allSettled(nextAssets.map")).toBeLessThan(catalog.indexOf("setPage(nextPage)"));
    expect(catalog).toContain("scrollCatalogGridInsideManager(gridRef.current)");
    expect(catalog).not.toContain("gridRef.current?.scrollIntoView");
  });

  it("keeps online gallery pages mounted until data and thumbnails are ready", () => {
    const gallery = read("src/AitagGallery.tsx");
    const aitag = read("electron/ipc/aitag.ts");
    const external = read("electron/ipc/online-gallery.ts");

    expect(gallery).toContain("const [pendingPage, setPendingPage]");
    expect(gallery).toContain("await Promise.allSettled(pageResult.items.map");
    expect(gallery).toContain("await Promise.allSettled(normalized.items.map");
    expect(gallery).toContain("pendingRankingPage");
    expect(gallery).not.toContain("pageRef.current?.scrollIntoView");
    expect(aitag).toContain("page_size: AITAG_API_PAGE_SIZE");
    expect(aitag).toContain("combinedItems.slice(sliceStart, sliceStart + request.pageSize)");
    expect(external).toContain("limit: targetPageSize");
    expect(external).toContain("items: filtered.slice(offset, offset + targetPageSize)");
  });

  it("loads twelve artist works per preview page and opens an internal lightbox", () => {
    const gallery = read("src/AitagGallery.tsx");
    const artistIpc = read("electron/ipc/artist-lab.ts");
    const preload = read("electron/preload.ts");
    const main = read("electron/main.ts");

    expect(gallery).toContain("const ARTIST_PREVIEW_PAGE_SIZE = 12");
    expect(gallery).toContain("artistLabStylePreviewPage(");
    expect(gallery).toContain("onDoubleClick={() => setPreviewLightbox");
    expect(gallery).toContain('className="artist-ranking-lightbox"');
    expect(gallery).toContain("window.naiDesktop.openExternal(previewLightbox.items[previewLightbox.index].postUrl");
    expect(artistIpc).toContain("export async function artistStylePreviewPage(");
    expect(artistIpc).toContain("Math.min(24");
    expect(preload).toContain('ipcRenderer.invoke("artistLab:stylePreviewPage"');
    expect(main).toContain('"artistLab:stylePreviewPage"');
  });

  it("preserves source aspect ratios across online image grids", () => {
    const gallery = read("src/AitagGallery.tsx");
    const catalog = read("src/ReferenceCatalogPanel.tsx");
    const styles = read("src/styles.css");

    expect(gallery).toContain("image.naturalWidth / image.naturalHeight");
    expect(gallery).toContain("`${item.cover.width} / ${item.cover.height}`");
    expect(catalog).toContain("`${asset.width} / ${asset.height}`");
    expect(styles).toContain(".aitag-work-grid {");
    expect(styles).toMatch(/\.aitag-card-image img[\s\S]*?object-fit:\s*contain/);
    expect(styles).toMatch(/\.reference-catalog-grid[^}]*align-items:\s*start/);
  });
});
