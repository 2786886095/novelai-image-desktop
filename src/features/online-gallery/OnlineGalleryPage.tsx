import AitagGallery from "../../AitagGallery";

/**
 * Top-level online gallery route.
 *
 * AITag is the first source. Keeping the route separate from the source UI is
 * the seam for adding capability-driven adapters without putting source checks
 * back into App.tsx or ToolsHub.
 */
export default function OnlineGalleryPage() {
  return <AitagGallery />;
}

