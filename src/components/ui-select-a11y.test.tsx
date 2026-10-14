import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectMenu, SelectMenuCompat } from "./ui";

it("shared SelectMenu associates the trigger with explanatory privacy text without a native select", () => {
  const html = renderToStaticMarkup(<SelectMenu id="metadata-mode" value="online" ariaLabel="Read mode" ariaDescribedBy="privacy-note" options={[{ value: "online", label: "Online" }, { value: "offline", label: "Offline" }]} onChange={() => {}} />);
  expect(html).toContain('aria-describedby="privacy-note"');
  expect(html).toContain('aria-label="Read mode: Online"');
  expect(html).toContain('aria-haspopup="listbox"');
  expect(html).toContain('class="select-menu-trigger"');
  expect(html).not.toContain("<select");
});
it("the native-authoring compatibility adapter also preserves aria-describedby", () => {
  const html = renderToStaticMarkup(<SelectMenuCompat value="online" aria-label="Read mode" aria-describedby="privacy-note"><option value="online">Online</option></SelectMenuCompat>);
  expect(html).toContain('aria-describedby="privacy-note"'); expect(html).not.toContain("<select");
});
