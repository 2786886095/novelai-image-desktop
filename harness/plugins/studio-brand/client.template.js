window.__ModuleLoader__.load({
  id: "@langbai/dsh-studio-brand",
  factory(require) {
    const { jsx, jsxs } = require("react/jsx-runtime");
    const icon = __STUDIO_ICON_JSON__;
    function StudioMark({ size = 28 }) {
      return jsx("img", {
        src: icon, alt: "NovelAI Studio", draggable: false,
        style: { display: "block", flexShrink: 0, width: size, height: size, objectFit: "contain", borderRadius: 6 },
      });
    }
    function StudioName() {
      return jsxs("span", {
        "data-studio-wordmark": "",
        style: { display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", lineHeight: 1, flexShrink: 0 },
        children: [
          jsx("strong", { children: "NovelAI", style: { fontFamily: "inherit", fontSize: 18, fontWeight: 700, letterSpacing: "-.035em", lineHeight: 1 } }),
          jsx("span", {
            children: "STUDIO", "data-studio-badge": "",
            style: {
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              height: 14, boxSizing: "border-box", padding: "0 4px", margin: 0, border: "none", borderRadius: 2,
              fontFamily: "inherit", fontSize: 9, fontWeight: 700, lineHeight: "14px", letterSpacing: ".025em",
              background: "var(--dsw-alias-label-primary, #17181c)", color: "var(--dsw-alias-bg-module-platform, #ffffff)",
            },
          }),
        ],
      });
    }
    function apply(ctx) {
      for (const [name, component] of [
        ["sidebar.brand.mark", StudioMark],
        ["sidebar.brand.name", StudioName],
        ["conversation.hero.brand.mark", StudioMark],
      ]) {
        ctx.slots.inject(name, () => ctx.slots.register({ name }, component));
      }
      ctx.effect(() => {
        const oldTitle = document.title;
        const updateTitle = () => {
          const title = document.title.replace(/DeepSeek Harness|DeepSeek|DSH Local Build/gi, "NovelAI Studio");
          if (title !== document.title) document.title = title;
        };
        updateTitle();
        const titleElement = document.querySelector("title");
        const observer = new MutationObserver(updateTitle);
        if (titleElement) observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
        const favicon = document.createElement("link");
        favicon.rel = "icon";
        favicon.href = icon;
        document.head.append(favicon);
        return () => { observer.disconnect(); favicon.remove(); document.title = oldTitle; };
      });
    }
    return { inject: ["slots"], apply };
  },
});
