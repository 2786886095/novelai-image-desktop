// UI-only adapter for pinned Mindspace 0.7.0. Never rewrites stored documents,
// activeMode, model classification, tools or host-side memory services.
export function simplifyMemoryUI(source) {
 const newline=source.includes('\r\n')?'\r\n':'\n';
 let code=source.replaceAll('\r\n','\n');
 if(code.includes('// Studio memory UI: automatic selection, both banks retained.'))return source;
 function replaceOnce(from,to){
  const at=code.indexOf(from);
  if(at<0||code.indexOf(from,at+from.length)>=0)throw Error('Pinned memory UI changed: '+from.slice(0,70));
  code=code.slice(0,at)+to+code.slice(at+from.length);
 }
 const chipStart=code.indexOf('\t\tfunction MemoryModeChip(');
 const chipEnd=code.indexOf('\t\tfunction SessionMemorySection(',chipStart);
 if(chipStart<0||chipEnd<chipStart)throw Error('Pinned memory chip boundaries changed');
 code=code.slice(0,chipStart)+code.slice(chipEnd);
 replaceOnce(`\t\t\tctx.slots.inject("conversation.input.left", () => ctx.slots.register({
\t\t\t\tname: "conversation.input.left",
\t\t\t\tid: "session-memory-mode",
\t\t\t\torder: 40,
\t\t\t\tinject: () => ({ remote })
\t\t\t}, MemoryModeChip));`,'// Studio memory UI: automatic selection, both banks retained.');
 replaceOnce('\t\t\tconst [tab, setTab] = (0, react.useState)("chat");\n','');
 replaceOnce('\t\t\t\tsetTab(doc.activeMode);\n','');
 const start=code.indexOf('\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\t\tclassName: SessionMemorySection_module_css_default.modeTabs,');
 const end=code.indexOf('\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {',start);
 if(start<0||end<start)throw Error('Pinned memory editor boundaries changed');
 code=code.slice(0,start)+`                        ["chat", "work"].map((mode) => (0, react_jsx_runtime.jsxs)("section", {
                            className: SessionMemorySection_module_css_default.card,
                            children: [
                                (0, react_jsx_runtime.jsx)("h3", { children: mode === "chat" ? "日常记忆" : "任务记忆" }),
                                (0, react_jsx_runtime.jsx)(ModeEditor, {
                                    mode,
                                    value: draft[mode],
                                    onChange: (value) => setDraft((current) => ({ ...current, [mode]: value }))
                                })
                            ]
                        }, mode)),
`+code.slice(end);
 replaceOnce('同一个人、同一个 AI，按当前任务载入 Chat 或 Work。模式不限制工具，只隔离记忆与写入目标。','系统根据对话内容自动选择适用记忆，无需手动切换。已有日常记忆和任务记忆均保留，可在下方查看和编辑。');
 replaceOnce('复制当前 Chat、Work、人物、AI 设定、长期记忆与桥接状态；不复制聊天记录','复制当前日常记忆、任务记忆、人物、AI 设定、长期记忆与桥接状态；不复制聊天记录');
 return code.replaceAll('\n',newline);
}
