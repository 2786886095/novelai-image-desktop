# Issue #59 — editable translation preview

- Source and translation are local editable drafts. Parent prompts change only on explicit Apply; Cancel / Escape / failed requests do not apply edits.
- `translateRealtime` defaults to false, including old settings imports. Enable it directly below the language selectors in Translation Preview, or in Settings → translation, to use a 600 ms trailing debounce. Both switches persist the same preference; reopening the preview remembers it. Disabling cancels queued automatic requests; manual translation remains available. A failed save restores the switch and displays an error.
- `translateSourceLanguage` defaults to `auto`; target continues to follow software language unless explicitly selected.
- Source ⇄ target is always shown. Automatic source detection must succeed before an auto-source swap can be enabled; users may also explicitly choose a source. A valid translated pair swaps texts along with concrete languages, which are saved.
- At most one provider request is in flight per preview. A revision token rejects stale results after source/language/manual-result edits; the latest queued draft runs next. IME composition does not send partial text. Closing cancels timers and ignores late results; failures do not auto-retry.
- Mobile preview requests do not set the global generation busy flag. Desktop Google/Baidu/AI and mobile Google/Baidu pass an explicit source when selected. Older non-preview calls still default to automatic detection.
- Shared desktop renderer covers Windows/macOS/Linux. Flutter UI uses stacked language/draft controls on narrow screens. Verification uses isolated provider fixtures, no user credentials or paid generation calls.

Local-only candidate; no version increase or GitHub publication is implied.
