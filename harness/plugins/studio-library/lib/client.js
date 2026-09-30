window.__ModuleLoader__.load({id:"@langbai/dsh-studio-library",factory(require){const module={exports:{}};const exports=module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let react = require("react");
react = __toESM(react, 1);
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
//#region harness/plugins/studio-library/panel-geometry.js
function defaultPanel(v) {
	const width = Math.min(420, Math.max(1, v.width - 16)), height = Math.min(660, Math.max(1, v.height - 32));
	return clampPanel({
		x: v.x + v.width - width - 16,
		y: v.y + 56,
		width,
		height
	}, v);
}
function clampPanel(rect, v) {
	const pad = Math.min(8, v.width / 4, v.height / 4), maxW = Math.max(1, v.width - pad * 2), maxH = Math.max(1, v.height - pad * 2);
	const width = Math.min(maxW, Math.max(Math.min(300, maxW), rect.width));
	const height = Math.min(maxH, Math.max(Math.min(260, maxH), rect.height));
	return {
		x: Math.min(v.x + v.width - pad - width, Math.max(v.x + pad, rect.x)),
		y: Math.min(v.y + v.height - pad - height, Math.max(v.y + pad, rect.y)),
		width,
		height
	};
}
function changePanel(rect, dx, dy, resize, v) {
	return clampPanel(resize ? {
		...rect,
		width: Math.min(v.x + v.width - 8 - rect.x, rect.width + dx),
		height: Math.min(v.y + v.height - 8 - rect.y, rect.height + dy)
	} : {
		...rect,
		x: rect.x + dx,
		y: rect.y + dy
	}, v);
}
//#endregion
//#region harness/plugins/studio-library/floating-panel.js
const h$9 = react.default.createElement;
const viewport = () => {
	const v = window.visualViewport;
	return {
		x: v?.offsetLeft ?? 0,
		y: v?.offsetTop ?? 0,
		width: v?.width ?? innerWidth,
		height: v?.height ?? innerHeight
	};
};
function FloatingPanel({ call, onClose, children }) {
	const [view, setView] = (0, react.useState)(viewport), [preferred, setPreferred] = (0, react.useState)(null), [error, setError] = (0, react.useState)(""), [saving, setSaving] = (0, react.useState)(false);
	const profile = view.width <= 600 ? "phone" : "desktop";
	const rect = preferred ? clampPanel(preferred, view) : defaultPanel(view);
	const current = (0, react.useRef)(rect), gesture = (0, react.useRef)(null), changed = (0, react.useRef)(0), mounted = (0, react.useRef)(true), queue = (0, react.useRef)(Promise.resolve()), panel = (0, react.useRef)(null), before = (0, react.useRef)(null);
	current.current = rect;
	(0, react.useEffect)(() => {
		mounted.current = true;
		before.current = document.activeElement;
		panel.current?.focus({ preventScroll: true });
		return () => {
			mounted.current = false;
			if (before.current?.isConnected) before.current.focus({ preventScroll: true });
		};
	}, []);
	(0, react.useEffect)(() => {
		const update = () => {
			gesture.current = null;
			setView(viewport());
		};
		window.addEventListener("resize", update);
		window.visualViewport?.addEventListener("resize", update);
		window.visualViewport?.addEventListener("scroll", update);
		return () => {
			window.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("scroll", update);
		};
	}, []);
	(0, react.useEffect)(() => {
		let live = true;
		const revision = ++changed.current;
		setPreferred(null);
		call("studio_panel_layout", { profile }).then((v) => {
			if (live && changed.current === revision) {
				setPreferred(v.rect);
				setError("");
			}
		}).catch((e) => {
			if (live) setError("布局读取失败：" + e.message);
		});
		return () => {
			live = false;
		};
	}, [call, profile]);
	function save(value) {
		const revision = ++changed.current;
		setSaving(true);
		queue.current = queue.current.catch(() => {}).then(() => call("studio_save_panel_layout", {
			profile,
			rect: value
		})).then(() => {
			if (mounted.current && changed.current === revision) {
				setError("");
				setSaving(false);
			}
		}).catch((e) => {
			if (mounted.current && changed.current === revision) {
				setError("布局未保存：" + e.message);
				setSaving(false);
			}
		});
	}
	function start(e, resize) {
		if (e.button !== 0 || !resize && e.target.closest("button")) return;
		changed.current++;
		gesture.current = {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			rect: current.current,
			resize
		};
		e.currentTarget.setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function move(e) {
		const g = gesture.current;
		if (!g || g.id !== e.pointerId) return;
		const next = changePanel(g.rect, e.clientX - g.x, e.clientY - g.y, g.resize, viewport());
		current.current = next;
		setPreferred(next);
	}
	function finish(e, cancel = false) {
		const g = gesture.current;
		if (!g || g.id !== e.pointerId) return;
		gesture.current = null;
		if (cancel) {
			current.current = g.rect;
			setPreferred(g.rect);
		} else save(current.current);
		if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
	}
	function keys(e, resize) {
		const delta = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		}[e.key];
		if (!delta || e.target !== e.currentTarget) return;
		e.preventDefault();
		const step = e.shiftKey ? 32 : 8, next = changePanel(current.current, delta[0] * step, delta[1] * step, resize, viewport());
		current.current = next;
		setPreferred(next);
		save(next);
	}
	const handlers = (resize) => ({
		onPointerDown: (e) => start(e, resize),
		onPointerMove: move,
		onPointerUp: (e) => finish(e),
		onPointerCancel: (e) => finish(e, true),
		onLostPointerCapture: () => {
			gesture.current = null;
		},
		onKeyDown: (e) => keys(e, resize)
	});
	return h$9("section", {
		ref: panel,
		tabIndex: -1,
		className: "studio-floating-panel",
		role: "dialog",
		"aria-modal": false,
		"aria-label": "软件参数",
		style: {
			left: rect.x,
			top: rect.y,
			width: rect.width,
			height: rect.height
		},
		onKeyDown: (e) => {
			if (e.key === "Escape" && !e.defaultPrevented) {
				e.stopPropagation();
				onClose();
			}
		}
	}, h$9("header", {
		className: "studio-floating-header",
		tabIndex: 0,
		"aria-label": "拖动参数面板",
		"aria-description": "拖动标题栏，或使用方向键移动",
		...handlers(false)
	}, h$9("strong", null, "软件参数"), h$9("button", {
		type: "button",
		onClick: () => {
			setPreferred(null);
			current.current = defaultPanel(viewport());
			save(null);
		},
		title: "恢复默认位置和大小",
		"aria-label": "恢复默认位置和大小"
	}, "恢复默认"), h$9("button", {
		type: "button",
		"aria-label": "关闭软件面板",
		onClick: onClose
	}, "×")), h$9("div", { className: "studio-floating-body" }, children), h$9("footer", { className: "studio-floating-footer" }, h$9("small", { "aria-live": "polite" }, error || (saving ? "正在保存布局…" : "拖动标题栏移动 · 右下角调整大小")), error ? h$9("button", { onClick: () => save(preferred) }, "重试保存") : null, h$9("button", {
		type: "button",
		className: "studio-floating-resize",
		"aria-label": "调整参数面板大小",
		title: "拖动或使用方向键调整大小",
		...handlers(true)
	}, "↘")));
}
const floatingPanelCSS = `
.studio-floating-panel{position:fixed;z-index:25;pointer-events:auto;display:flex;flex-direction:column;box-sizing:border-box;min-width:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 8px 28px #0002;font:inherit;outline:none}
.studio-floating-header{display:flex;align-items:center;gap:8px;flex:none;padding:10px 12px;min-height:48px;box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);cursor:move;touch-action:none;user-select:none}
.studio-floating-header strong{flex:1;min-width:0;font-size:14px}.studio-floating-header button,.studio-floating-footer button{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;cursor:pointer;padding:4px 8px;min-height:32px}
.studio-floating-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.studio-floating-body>.studio-library{max-height:none;overflow:visible;padding:12px}.studio-floating-footer{display:flex;align-items:center;gap:4px;flex:none;min-height:32px;padding-left:12px;border-top:1px solid var(--dsw-alias-border-l2)}.studio-floating-footer small{flex:1;color:var(--dsw-alias-label-secondary);font-size:11px;overflow-wrap:anywhere}.studio-floating-footer .studio-floating-resize{border:0;border-radius:0;cursor:nwse-resize;touch-action:none;user-select:none;width:36px;min-height:36px;background:transparent}
.studio-floating-panel :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.studio-floating-panel .studio-library-field{gap:6px;margin-bottom:10px}.studio-floating-panel .studio-library-toolbar{gap:6px;margin-bottom:8px}.studio-floating-panel .studio-session-controls{font-size:13px}.studio-floating-panel .studio-session-controls h3{font-size:14px;margin:0 0 8px}.studio-floating-panel .studio-session-controls p{margin:6px 0}.studio-floating-panel .studio-session-controls .studio-library-field input[type=number]{width:90px!important;max-width:90px!important;flex:0 0 90px}.studio-floating-panel .studio-session-controls .studio-library-field{flex-direction:row;align-items:center;justify-content:space-between}.studio-floating-panel .studio-parameter-tabs{margin:8px 0}.studio-floating-panel .studio-parameter-tabs button{min-height:36px}.studio-floating-panel .studio-parameter-card{gap:6px;padding:10px}.studio-floating-panel .studio-parameter-card p{margin:0}.studio-floating-panel .studio-parameter-actions:empty{display:none}@media(max-width:600px){.studio-floating-header{min-height:52px}.studio-floating-header button{min-height:40px}.studio-floating-footer .studio-floating-resize{width:44px;min-height:44px}}
`;
//#endregion
//#region harness/plugins/studio-library/session-panel.js
const h$8 = react.default.createElement;
function selectedSession(state) {
	const selected = Object.values(state?.byId ?? {}).filter((s) => (s.retainedBy?.mainView ?? 0) > 0);
	return selected.length === 1 ? selected[0].id : null;
}
function SessionControls({ call, sessionId, onStyles }) {
	const [state, setState] = (0, react.useState)(null), [limit, setLimit] = (0, react.useState)(0), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)("");
	(0, react.useEffect)(() => {
		let live = true;
		setState(null);
		setError("");
		if (!sessionId) return;
		const read = () => call("studio_session_state", { sessionId }).then((v) => {
			if (live) setState(v);
		}).catch((e) => {
			if (live) setError(e.message);
		});
		read();
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") read();
		}, 2500);
		return () => {
			live = false;
			clearInterval(timer);
		};
	}, [call, sessionId]);
	async function change(tool, args) {
		setBusy(true);
		setError("");
		try {
			setState(await call(tool, {
				...args,
				sessionId
			}));
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}
	return h$8("section", { className: "studio-library studio-session-controls" }, h$8("h3", null, "当前会话 · 生图控制"), !sessionId ? h$8("p", null, "请先创建或选择一个酒馆会话。") : h$8(react.default.Fragment, null, h$8("p", null, "风格：", state?.style?.name ?? "跟随软件工作台"), h$8("div", { className: "studio-library-toolbar" }, h$8("button", { onClick: onStyles }, "选择风格"), h$8("button", {
		disabled: busy || !state?.style,
		onClick: () => change("studio_set_session_style", { presetId: null })
	}, "跟随工作台")), h$8("p", { className: "studio-library-muted" }, "选择风格不会生成图片，也不会修改软件工作台。"), h$8("label", { className: "studio-library-field" }, "自动生成张数上限（0 为不限）", h$8("input", {
		type: "number",
		min: 0,
		max: 100,
		step: 1,
		value: limit,
		disabled: busy,
		onChange: (e) => setLimit(e.target.value)
	})), h$8("div", { className: "studio-library-toolbar" }, h$8("button", {
		"aria-pressed": state?.mode === "confirm",
		disabled: busy,
		onClick: () => change("studio_generation_policy", { mode: "confirm" })
	}, "逐次确认"), h$8("button", {
		"aria-pressed": state?.mode === "auto",
		disabled: busy || !Number.isInteger(Number(limit)) || Number(limit) < 0 || Number(limit) > 100,
		onClick: () => change("studio_generation_policy", {
			mode: "auto",
			limit: Number(limit)
		})
	}, "授权全自动")), h$8("p", { role: "status" }, state?.mode === "auto" ? state.limit === 0 ? "全自动 · 不限张数" : `全自动 · 本次剩余 ${state.remaining} / ${state.limit} 张` : "每次生成前确认"), h$8("p", { className: "studio-library-muted" }, "默认全自动、不限累计张数，可能消耗 Anlas 和模型费用。可随时切换逐次确认或停止；选择会保存到当前会话。设置上限后失败尝试也计入限额。"), h$8("button", {
		disabled: busy,
		onClick: () => change("studio_stop_generation", {})
	}, "停止并撤销自动授权")), error ? h$8("p", { role: "alert" }, error) : null);
}
function StyleCard({ style, call, sessionId, onEdit }) {
	const [preview, setPreview] = (0, react.useState)(null), [error, setError] = (0, react.useState)(""), [message, setMessage] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [large, setLarge] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		let live = true;
		setPreview(null);
		call("studio_style_preview", { presetId: style.id }).then((v) => {
			if (live) setPreview(v);
		}).catch((e) => {
			if (live) setError(e.message);
		});
		return () => {
			live = false;
		};
	}, [call, style.id]);
	(0, react.useEffect)(() => {
		if (!large) return;
		const close = (e) => {
			if (e.key === "Escape") setLarge(false);
		};
		document.addEventListener("keydown", close);
		return () => document.removeEventListener("keydown", close);
	}, [large]);
	async function use() {
		setBusy(true);
		try {
			await call("studio_set_session_style", {
				sessionId,
				presetId: style.id
			});
			setMessage("已用于当前会话 · 未生成图片");
			setError("");
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}
	async function image(id) {
		try {
			setPreview(await call("studio_style_preview", {
				presetId: style.id,
				imageId: id,
				large: true
			}));
			setLarge(true);
		} catch (e) {
			setError(e.message);
		}
	}
	return h$8("article", { className: "studio-style-card" }, preview?.dataUrl ? h$8("button", {
		className: "studio-style-thumb",
		"aria-label": "预览 " + style.name,
		onDoubleClick: () => image(preview.imageId)
	}, h$8("img", {
		src: preview.dataUrl,
		alt: style.name,
		loading: "lazy"
	})) : h$8("span", { className: "studio-style-thumb" }, error ? "预览读取失败" : "暂无预览"), h$8("div", null, h$8("strong", null, style.name), h$8("small", null, `${style.group ?? "默认"} · ${style.rating ?? 0}/5`), h$8("p", null, style.prompt), h$8("div", { className: "studio-library-toolbar" }, h$8("button", {
		disabled: busy || !sessionId,
		onClick: use
	}, "用于当前会话"), h$8("button", { onClick: onEdit }, "编辑"), preview?.dataUrl ? h$8("button", { onClick: () => image(preview.imageId) }, "预览") : null), message ? h$8("small", { role: "status" }, message) : null, error ? h$8("small", { role: "alert" }, error) : null), large ? h$8("div", {
		className: "studio-image-lightbox",
		role: "dialog",
		"aria-modal": true,
		"aria-label": "风格预览",
		onClick: (e) => {
			if (e.target === e.currentTarget) setLarge(false);
		}
	}, h$8("img", {
		src: preview.dataUrl,
		alt: style.name
	}), h$8("div", { className: "studio-preview-actions" }, h$8("button", { onClick: () => setLarge(false) }, "关闭"), ...(preview.images ?? []).map((v, i) => h$8("button", {
		key: v.id,
		onClick: () => image(v.id)
	}, String(i + 1))))) : null);
}
function Workspaces({ call }) {
	const [items, setItems] = (0, react.useState)([]), [error, setError] = (0, react.useState)("");
	const load = (tool) => call(tool).then(setItems).catch((e) => setError(e.message));
	(0, react.useEffect)(() => {
		load("studio_workspaces");
	}, [call]);
	return h$8("section", { className: "studio-library" }, h$8("p", null, "同名工作区可能来自不同软件目录。只清理无会话的自动工作区；历史会话和目录均保留。"), h$8("button", { onClick: () => load("studio_cleanup_empty_workspaces") }, "整理空工作区"), error ? h$8("p", { role: "alert" }, error) : null, ...items.map((w) => h$8("article", { key: w.id }, h$8("strong", null, w.title), h$8("p", null, `${w.sessions} 个会话`), h$8("small", null, w.path))));
}
function MemoryPanel({ remote, sessionId }) {
	const [doc, setDoc] = (0, react.useState)(null), [draft, setDraft] = (0, react.useState)(null), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [message, setMessage] = (0, react.useState)("");
	const read = async () => {
		if (!remote) throw Error("记忆组件连接未就绪，请完成兼容更新后重启 Agent");
		const r = await remote.get(sessionId);
		if (!r.ok) throw Error(r.error.message);
		setDoc(r.value.document);
		setDraft(structuredClone(r.value.document));
	};
	(0, react.useEffect)(() => {
		let live = true;
		if (!sessionId) return;
		setDoc(null);
		if (!remote) {
			setError("记忆组件未连接");
			return;
		}
		remote.get(sessionId).then((r) => {
			if (!live) return;
			if (!r.ok) throw Error(r.error.message);
			setDoc(r.value.document);
			setDraft(structuredClone(r.value.document));
		}).catch((e) => {
			if (live) setError(e.message);
		});
		return () => {
			live = false;
		};
	}, [remote, sessionId]);
	async function run(fn) {
		setBusy(true);
		setError("");
		try {
			await fn();
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}
	const save = () => run(async () => {
		const { activeMode, modeSource, modeReason, chat, work, bridge } = draft;
		const r = await remote.replace(sessionId, {
			expectedRevision: doc.revision,
			activeMode,
			modeSource,
			modeReason,
			chat,
			work,
			bridge
		});
		if (!r.ok || !r.value.ok) throw Error(r.error?.message ?? r.value.error.message);
		await read();
		setMessage("当前会话记忆已保存并回读");
	});
	return h$8("section", { className: "studio-library" }, h$8("h3", null, "当前会话记忆"), !sessionId ? h$8("p", null, "先创建或选择一个会话，再查看该会话的记忆。") : h$8(react.default.Fragment, null, h$8("p", { className: "studio-library-muted" }, "日常记忆与任务记忆分别保留；这里读取实际记忆组件，不是软件旧版记忆列表。"), error ? h$8("p", { role: "alert" }, error) : null, message ? h$8("p", { role: "status" }, message) : null, h$8("button", {
		disabled: busy,
		onClick: () => run(read)
	}, "重新读取"), !draft ? h$8("p", null, error ? "读取未完成" : "正在读取…") : h$8(react.default.Fragment, null, ...["chat", "work"].map((mode) => h$8("section", { key: mode }, h$8("h4", null, mode === "chat" ? "日常记忆" : "任务记忆"), ...["assistantSetting", "assistantState"].map((key) => h$8("label", {
		key,
		className: "studio-library-field"
	}, key === "assistantSetting" ? "AI 设定" : "AI 当前状态", h$8("textarea", {
		rows: 3,
		value: draft[mode]?.[key] ?? "",
		disabled: busy,
		onChange: (e) => setDraft({
			...draft,
			[mode]: {
				...draft[mode],
				[key]: e.target.value
			}
		})
	}))), h$8("p", null, `人物 ${draft[mode]?.people?.length ?? 0} 位`), h$8("details", null, h$8("summary", null, "查看此记忆库完整内容"), h$8("pre", null, JSON.stringify(draft[mode], null, 2))))), h$8("button", {
		disabled: busy,
		onClick: save
	}, "保存当前会话记忆"))));
}
//#endregion
//#region harness/plugins/studio-library/local-data-panel.js
const h$7 = react.default.createElement;
const collections = {
	characters: "角色卡",
	personas: "用户人设",
	lorebooks: "世界书",
	samplerPresets: "酒馆采样预设",
	styles: "画风预设",
	positivePresets: "正面提示词预设",
	characterPresets: "角色提示词",
	promptChunks: "提示词片段",
	references: "参考图预设"
};
const portable = new Set([
	"characters",
	"personas",
	"lorebooks",
	"samplerPresets",
	"styles",
	"positivePresets"
]);
function parseTransfer(text) {
	if (text.length > 95e3) throw Error("文本文件超过限制；请用软件完整备份导入");
	const data = JSON.parse(text);
	if (data?.format !== "studio-local-text/v1" || !portable.has(data.collection) || !Array.isArray(data.items) || !data.items.length || data.items.length > 50) throw Error("请选择本面板导出的文本资料文件（1–50 项）");
	return {
		collection: data.collection,
		items: data.items
	};
}
function LocalDataPanel({ call, sessionId }) {
	const [collection, setCollection] = (0, react.useState)("characters"), [query, setQuery] = (0, react.useState)(""), [offset, setOffset] = (0, react.useState)(0), [result, setResult] = (0, react.useState)(null), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [pending, setPending] = (0, react.useState)(null), [message, setMessage] = (0, react.useState)(""), [reload, setReload] = (0, react.useState)(0);
	const file = (0, react.useRef)(null), serial = (0, react.useRef)(0);
	(0, react.useEffect)(() => {
		let live = true;
		const id = ++serial.current;
		setResult(null);
		setError("");
		setBusy(true);
		const timer = setTimeout(() => call("langbai_list_studio_data", {
			collection,
			query,
			offset,
			limit: 20
		}).then((v) => {
			if (!v || !Array.isArray(v.items)) throw Error("本机数据接口没有返回资料，请从软件内重新启动 Agent");
			if (live) setResult(v);
		}).catch((e) => {
			if (live) setError(e.message);
		}).finally(() => {
			if (live && id === serial.current) setBusy(false);
		}), 180);
		return () => {
			live = false;
			clearTimeout(timer);
		};
	}, [
		call,
		collection,
		query,
		offset,
		reload
	]);
	async function applyMaterial(item) {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			const args = {
				collection,
				id: item.id,
				sessionId
			};
			const preview = await call("studio_session_material", {
				...args,
				action: "inspect"
			});
			if (!preview.canApply) throw Error("请先停止或等待当前会话完成，再应用资料");
			setMessage("请在 Agent 内的确认卡片核对本次绑定。");
			const result = await call("studio_session_material", {
				...args,
				action: "apply",
				expectedRevision: preview.expectedRevision
			});
			if (result.cancelled) {
				setMessage("已取消，资料和会话未修改");
				return;
			}
			if (!result.ok) throw Error(result.error ?? "应用未完成，请检查会话资料，勿重复导入");
			setMessage((result.alreadyApplied ? "当前会话已使用这份资料" : "已应用到当前会话，下一轮对话生效") + "；没有生成图片。" + (result.warnings ?? []).join(" "));
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}
	async function importFile(e) {
		setError("");
		setPending(null);
		const selected = e.target.files?.[0];
		e.target.value = "";
		if (!selected) return;
		try {
			if (selected.size > 38e4) throw Error("文件过大，请使用完整备份导入");
			setPending(parseTransfer(await selected.text()));
		} catch (e) {
			setError(e.message);
		}
	}
	async function importNow() {
		setBusy(true);
		setError("");
		try {
			const data = await call("langbai_import_studio_data", pending);
			if (!data?.imported) throw Error("没有收到导入完成结果，请刷新核对，勿重复导入");
			setMessage(`已新增 ${data.imported} 项；备份：${data.backupPath}`);
			setPending(null);
			setReload((x) => x + 1);
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}
	function download() {
		try {
			const text = JSON.stringify({
				format: "studio-local-text/v1",
				collection,
				items: result.items
			}, null, 2);
			parseTransfer(text);
			const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
			const link = document.createElement("a");
			link.href = url;
			link.download = `studio-${collection}-${Date.now()}.json`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 6e4);
		} catch (e) {
			setError(e.message);
		}
	}
	return h$7("section", {
		className: "studio-library studio-local-data",
		"aria-busy": busy
	}, h$7("h3", null, "本机资料 · 导入 / 导出"), h$7("p", { className: "studio-library-muted" }, "读取当前运行 Studio 的本机已保存资料，不会自动与另一台设备同步。这里的角色卡和预设属于软件资料库；新酒馆 Roleplay 插件有独立资料库，可将所选资料应用到当前会话，自动创建或复用副本，原资料不会被覆盖。"), h$7("div", { className: "studio-library-grid" }, h$7("label", { className: "studio-library-field" }, "资料类型", h$7("select", {
		value: collection,
		disabled: busy || !!pending,
		onChange: (e) => {
			setCollection(e.target.value);
			setOffset(0);
		}
	}, ...Object.entries(collections).map(([value, label]) => h$7("option", {
		key: value,
		value
	}, label)))), h$7("label", { className: "studio-library-field" }, "搜索本机资料", h$7("input", {
		value: query,
		disabled: !!pending,
		onChange: (e) => {
			setQuery(e.target.value);
			setOffset(0);
		},
		placeholder: "名称或内容"
	}))), h$7("div", { className: "studio-library-toolbar" }, h$7("button", {
		disabled: busy,
		onClick: () => setReload((x) => x + 1)
	}, "重新读取"), h$7("button", {
		disabled: busy || !result?.items.length || !portable.has(collection),
		onClick: download
	}, "导出本页文本"), h$7("button", {
		disabled: busy,
		onClick: () => file.current.click()
	}, "导入文本资料"), h$7("input", {
		ref: file,
		type: "file",
		accept: ".json,application/json",
		hidden: true,
		onChange: importFile
	})), h$7("p", { className: "studio-library-muted" }, "文本交换保留正文，导入为新副本，不覆盖已有内容。图片、附件、对话和全部设置请使用 Studio「设置 → 数据与存储 → 跨端数据导入与导出」的 .naisbackup。"), error ? h$7("div", {
		role: "alert",
		className: "studio-library-error"
	}, error) : null, message ? h$7("p", {
		role: "status",
		style: { overflowWrap: "anywhere" }
	}, message) : null, pending ? h$7("div", { className: "studio-parameter-card" }, h$7("strong", null, `待导入：${collections[pending.collection]} · ${pending.items.length} 项`), h$7("p", null, pending.items.map((x) => x.name ?? "未命名").join("、")), h$7("p", { className: "studio-library-muted" }, "导入新增副本，不覆盖已有资料。原资料会保留；导入前会创建本机备份。"), h$7("div", { className: "studio-library-toolbar" }, h$7("button", {
		disabled: busy,
		onClick: () => setPending(null)
	}, "取消"), h$7("button", {
		disabled: busy,
		onClick: importNow
	}, "请求导入副本"))) : null, result ? h$7(react.default.Fragment, null, h$7("p", { className: "studio-library-muted" }, `${result.source ?? "Studio 本机资料"} · ${result.total} 项`), result.items.length ? h$7("div", { className: "studio-library-list" }, ...result.items.map((item, i) => h$7("article", { key: item.id ?? i }, h$7("div", null, h$7("strong", null, item.name ?? item.title ?? item.id ?? "未命名"), h$7("details", null, h$7("summary", null, "查看内容"), h$7("pre", null, JSON.stringify(item, null, 2)))), [
		"characters",
		"personas",
		"lorebooks",
		"samplerPresets"
	].includes(collection) ? h$7("button", {
		className: "studio-material-apply",
		disabled: busy || !sessionId || !!pending,
		onClick: () => applyMaterial(item)
	}, "应用到当前会话") : null))) : h$7("p", null, "已连接本机资料库，当前分类或搜索结果为空。"), h$7("div", { className: "studio-library-toolbar" }, h$7("button", {
		disabled: busy || offset === 0,
		onClick: () => setOffset(Math.max(0, offset - 20))
	}, "上一页"), h$7("span", null, `第 ${Math.floor(offset / 20) + 1} 页`), h$7("button", {
		disabled: busy || result.nextOffset == null,
		onClick: () => setOffset(result.nextOffset)
	}, "下一页"))) : !error ? h$7("p", { role: "status" }, "正在读取本机资料…") : null);
}
//#endregion
//#region harness/plugins/studio-library/client-state.js
const foldSnapshot = (previous, next) => previous?.revision !== void 0 && previous.revision === next.revision ? previous : next;
function startPolling({ read, publish, onError, isVisible, interval = 5e3, setTimer = setTimeout, clearTimer = clearTimeout }) {
	let stopped = false, timer;
	const schedule = () => {
		if (!stopped) timer = setTimer(tick, interval);
	};
	async function tick() {
		if (stopped) return;
		if (isVisible()) try {
			const data = await read();
			if (!stopped) publish(data);
		} catch (error) {
			if (!stopped) onError(error);
		}
		schedule();
	}
	schedule();
	return () => {
		stopped = true;
		clearTimer(timer);
	};
}
//#endregion
//#region harness/plugins/studio-library/parameter-help.js
const descriptions = {
	model: "选择负责生成图片的模型。不同模型支持的尺寸、采样器和功能可能不同；切换后请检查其他选项。",
	stylePrompt: "描述画风、媒介和画师倾向。这里编辑工作台参数；上方选择的会话风格只作用于当前酒馆会话。",
	positivePrompt: "描述希望出现的人物、动作、构图和场景。保存只修改参数，不会立即生成图片。",
	negativePrompt: "描述希望减少或避免出现的内容和画面缺陷。它不是绝对禁止清单，效果取决于模型。",
	width: "输出图片的横向像素数。宽高共同决定像素总量，可能影响生成耗时及费用；仍需符合模型限制。",
	height: "输出图片的纵向像素数。宽高比例会影响构图；仍需符合模型允许的尺寸与像素总量。",
	steps: "采样迭代次数。增加通常会延长生成时间，并不保证画质持续提升。",
	cfgScale: "提示词引导强度。较高时通常更强调提示词，过高可能出现生硬、过饱和等现象。",
	cfgRescale: "修正较强 CFG 引导造成的画面偏差。具体效果和支持情况取决于模型；0 表示不启用此修正。",
	sampler: "选择从噪声逐步生成图像的采样算法。不同算法的表现不同，没有对所有画面都最好的选项。",
	noiseSchedule: "设置采样过程中噪声变化的计划。是否生效取决于所选模型和采样器。",
	seed: "控制初始随机噪声。相同种子配合相同模型及其他参数，有助于比较改动；种子模式仍会影响实际使用值。",
	seedMode: "决定每张图片使用随机种子、固定种子或按顺序变化的种子。比较参数时可选择固定种子。",
	ucPreset: "选择模型提供的负面提示预设。不同模型支持的预设可能不同。",
	qualityPreset: "选择质量相关的预设组合；实际使用内容取决于当前模型和软件配置。",
	qualityToggle: "启用模型提供的质量提示词。可与手写提示词共同影响结果。",
	transparentBackground: "请求透明背景；仅在支持此功能的模型或工具中生效。",
	smea: "启用 SMEA 采样增强；只在支持该功能的模型与采样器中生效。",
	smeaDyn: "启用动态 SMEA；依赖所选模型与采样器的支持。",
	variety: "调整模型支持的多样性选项，可能改变输出变化程度。",
	fileNamePrefix: "保存生成图片时使用的文件名前缀，不会改变图像内容。",
	batchCount: "一次批量任务计划生成的张数。酒馆自动生成还受当前会话授权额度限制。",
	batchIntervalSeconds: "批量任务中两次生成之间的等待时间，单位为秒。",
	inpaintModel: "选择处理局部重绘的模型；需与原图及所用功能兼容。",
	inpaintStrength: "局部重绘对选中区域的改动程度。数值较高通常更容易偏离原图。",
	inpaintNoise: "局部重绘时加入的噪声程度，影响细节变化。",
	inpaintPositivePrompt: "描述希望在局部重绘区域出现的内容。",
	brushSize: "局部重绘蒙版笔刷的大小；不会直接改变生成图片尺寸。",
	brushOpacity: "绘制蒙版时笔刷的不透明程度。",
	brushShape: "绘制局部重绘蒙版时使用的笔刷形状。",
	upscaleScale: "超分辨率放大的倍率。MAX 按当前工具允许的上限处理。",
	directorTool: "选择上色、线稿、表情或背景处理等导演工具；不同工具需要不同参数。",
	strength: "图生图对输入图片的改动程度。数值越大，结果通常越容易偏离原图。",
	noise: "图生图加入的噪声程度，影响生成结果与原图的相似程度。",
	extraNoiseSeed: "控制额外噪声的随机来源，用于比较图生图的细节变化。",
	defry: "调整增强工具的处理强度，实际效果取决于选中的工具。",
	colorizePrompt: "为上色工具描述希望使用的颜色或上色方向。",
	emotion: "表情工具希望生成的情绪或表情类型。",
	emotionLevel: "表情调整的强弱程度。",
	language: "切换软件界面的显示语言，不会翻译已保存的提示词或对话。",
	theme: "选择浅色、深色或跟随系统的界面外观。",
	reduceMotion: "减少界面切换及反馈动画，不改变生成结果。",
	autoComplete: "输入提示词时显示补全建议。",
	weightHighlight: "在编辑器中突出显示提示词权重，便于检查写法。",
	promptRandomizer: "启用软件支持的提示词随机化功能。",
	superDrop: "启用增强拖放交互，方便把文件或图片带入工作台。",
	streamPreviewEnabled: "生成时显示支持的过程预览；不代表图片已完成保存。",
	showFloatingToolbar: "显示工作台悬浮操作工具栏。",
	historyJumpAfterGenerate: "生成完成后是否自动转到历史记录。",
	loggingEnabled: "记录软件运行日志，用于排查问题。",
	keepImageMetadata: "在保存的图片中保留生成参数；分享图片前请留意其中可能含有提示词。",
	saveToGallery: "在支持的设备上把生成图片保存到系统相册。",
	autoBackupEnabled: "启用定期自动备份，具体包含内容由备份选项决定。",
	autoBackupIntervalHours: "两次自动备份之间的间隔，单位为小时。",
	autoBackupRetentionCount: "自动备份保留的历史份数；清理行为按软件备份规则执行。",
	autoBackupIncludeImages: "自动备份是否包含图片文件。开启后备份可能明显增大。",
	lockStylePrompt: "锁定工作台使用的风格提示词；请同时检查已锁定的风格内容。",
	lockNegativePrompt: "锁定工作台使用的负面提示词；请同时检查已锁定的负面内容。",
	savedStylePrompt: "风格锁定启用时使用的已保存提示词。",
	savedNegativePrompt: "负面提示词锁定启用时使用的已保存内容。",
	persistGenerateParams: "重新启动软件后恢复常规生图参数。",
	persistI2IParams: "重新启动软件后恢复图生图参数。",
	persistInpaintParams: "重新启动软件后恢复局部重绘参数。",
	persistUpscaleParams: "重新启动软件后恢复超分参数。",
	persistDirectorParams: "重新启动软件后恢复导演工具参数。",
	visionApiModel: "图片识别和反推请求使用的模型名称；必须是所配置服务支持的模型。",
	visionSystemPrompt: "图片反推时提供给模型的系统指令。",
	convertApiModel: "提示词转换请求使用的模型名称。",
	convertSystemPrompt: "提示词转换时提供给模型的系统指令。",
	agentApiModel: "酒馆对话请求使用的模型名称；应与当前服务商提供的模型标识一致。",
	agentProviderName: "酒馆模型服务商的显示名称，用于识别当前配置。",
	agentContextWindow: "对话模型可使用的上下文窗口大小，按 Token 计；请按实际模型能力设置。",
	agentMaxOutputTokens: "单次模型回复允许输出的最大 Token 数；不应超过上下文窗口或服务商限制。",
	agentAutoCompact: "上下文较长时自动压缩已有内容；摘要可能损失部分细节。",
	agentVisionEnabled: "声明酒馆模型是否支持识别图片，开启前需确认模型支持。",
	reversePromptMode: "选择反推结果采用的提示词形式。",
	convertMode: "选择提示词转换的处理方式。",
	reversePromptTemplateVersion: "选择图片反推使用的提示词模板版本。",
	convertPromptTemplateVersion: "选择提示词转换使用的模板版本。",
	reverseConvertDshEnabled: "让反推与转换流程使用配置的酒馆处理能力。",
	reverseConvertDshMode: "选择酒馆参与反推或转换时采用的模式。",
	comicAnalyzePromptTemplate: "分析漫画内容时使用的提示词模板。",
	translateProvider: "选择翻译请求使用的服务。",
	translateAiModel: "选择 AI 翻译使用的模型名称。",
	stylePromptPresetSort: "决定风格预设在列表中的排列顺序。",
	historyRetentionDays: "图片历史记录的保留期限，单位为天；请留意软件的清理规则。",
	aitagCacheRetentionDays: "反推标签缓存的保留期限，单位为天。"
};
function parameterHelp(key, rule = {}) {
	const lines = [descriptions[key] ?? "此选项由当前工作台提供。修改前请核对当前模型是否支持；保存不会立即生成图片。"];
	if (rule.type === "number") lines.push(`允许范围：${rule.min ?? "未限定"}～${rule.max ?? "未限定"}${rule.step ? `；步长：${rule.step}` : ""}。`);
	if (rule.enum) lines.push(`请从下拉列表中的 ${rule.enum.length} 个有效选项选择。`);
	lines.push(rule.persistence === "session" ? "只对当前会话生效，重启后不保留。" : "普通参数保存后直接生效，不会触发生图。需要确认的操作会在 Agent 内提示。");
	return lines.join("\n");
}
//#endregion
//#region harness/plugins/studio-library/parameter-help-ui.js
const h$6 = react.default.createElement;
function ParameterHelp({ name, field, rule }) {
	const [hover, setHover] = (0, react.useState)(false), [focus, setFocus] = (0, react.useState)(false), [pinned, setPinned] = (0, react.useState)(false);
	const root = (0, react.useRef)(null), tip = (0, react.useRef)(null), id = (0, react.useId)(), open = hover || focus || pinned;
	const close = () => {
		setPinned(false);
		setHover(false);
		setFocus(false);
	};
	(0, react.useEffect)(() => {
		if (!open) return;
		const outside = (e) => {
			if (!root.current?.contains(e.target)) close();
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);
	(0, react.useLayoutEffect)(() => {
		if (!open || !tip.current) return;
		const node = tip.current, anchor = root.current.querySelector("button");
		node.showPopover?.();
		const place = () => {
			const a = anchor.getBoundingClientRect(), v = window.visualViewport;
			const left = v?.offsetLeft ?? 0, top = v?.offsetTop ?? 0, w = v?.width ?? innerWidth, height = v?.height ?? innerHeight;
			const b = anchor.closest(".studio-floating-body")?.getBoundingClientRect();
			if (b && (a.bottom <= b.top || a.top >= b.bottom)) {
				close();
				return;
			}
			const width = Math.min(360, Math.max(1, w - 16));
			node.style.width = width + "px";
			node.style.maxHeight = Math.max(1, Math.min(220, height - 16)) + "px";
			const n = node.getBoundingClientRect(), below = a.bottom + 6, above = a.top - n.height - 6;
			node.style.left = Math.max(left + 8, Math.min(a.left, left + w - width - 8)) + "px";
			node.style.top = Math.max(top + 8, Math.min(below + n.height <= top + height - 8 ? below : above, top + height - n.height - 8)) + "px";
		};
		place();
		const observer = new ResizeObserver(place);
		observer.observe(node);
		observer.observe(anchor);
		document.addEventListener("scroll", place, true);
		window.addEventListener("resize", place);
		vListen("addEventListener");
		function vListen(method) {
			window.visualViewport?.[method]("resize", place);
			window.visualViewport?.[method]("scroll", place);
		}
		return () => {
			observer.disconnect();
			document.removeEventListener("scroll", place, true);
			window.removeEventListener("resize", place);
			vListen("removeEventListener");
			if (node.hidePopover && node.matches(":popover-open")) node.hidePopover();
		};
	}, [open]);
	return h$6("span", {
		ref: root,
		className: "studio-help",
		onPointerEnter: (e) => {
			if (e.pointerType === "mouse") setHover(true);
		},
		onPointerLeave: () => setHover(false),
		onKeyDown: (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				close();
			}
		}
	}, h$6("button", {
		type: "button",
		className: "studio-help-trigger",
		"aria-label": name + "说明",
		"aria-expanded": open,
		"aria-describedby": open ? id : void 0,
		onFocus: () => setFocus(true),
		onBlur: () => setFocus(false),
		onClick: () => {
			if (pinned) close();
			else setPinned(true);
		}
	}, "ⓘ"), open ? h$6("span", {
		ref: tip,
		id,
		role: "tooltip",
		popover: "manual",
		className: "studio-help-content"
	}, parameterHelp(field, rule)) : null);
}
const helpCSS = `.studio-parameter-card .studio-library-toolbar{position:relative}.studio-help{display:inline-flex;align-items:center}.studio-library .studio-help-trigger{padding:2px 6px;min-width:28px;min-height:28px;border:0;border-radius:6px;background:transparent;cursor:help;color:var(--dsw-alias-label-secondary)}.studio-help-content{position:fixed;z-index:100;inset:auto;margin:0;box-sizing:border-box;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 4px 16px #0002;white-space:pre-line;overflow-wrap:anywhere;max-height:220px;overflow:auto;font-size:13px;line-height:1.6}.studio-help-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)}@media(pointer:coarse){.studio-library .studio-help-trigger{min-width:44px;min-height:44px}}`;
//#endregion
//#region harness/plugins/studio-library/parameter-panel.js
const h$5 = react.default.createElement;
const groups = {
	params: "常规生图",
	workbench: "批量 / 重绘 / 后期",
	i2iParams: "图生图",
	augmentOptions: "增强与导演工具",
	settings: "软件设置"
};
const labels = {
	model: "生成模型",
	stylePrompt: "风格提示词",
	positivePrompt: "正面提示词",
	negativePrompt: "负面提示词",
	width: "图片宽度",
	height: "图片高度",
	steps: "采样步数",
	cfgScale: "提示词引导 CFG",
	cfgRescale: "CFG 引导修正",
	sampler: "采样器",
	noiseSchedule: "噪声计划",
	seed: "随机种子",
	seedMode: "种子模式",
	ucPreset: "负面预设",
	qualityPreset: "质量预设",
	qualityToggle: "质量提示词",
	transparentBackground: "透明背景",
	smea: "SMEA",
	smeaDyn: "动态 SMEA",
	variety: "多样性",
	fileNamePrefix: "文件名前缀",
	batchCount: "批量张数",
	batchIntervalSeconds: "批次间隔（秒）",
	inpaintModel: "局部重绘模型",
	inpaintStrength: "局部重绘幅度",
	inpaintNoise: "局部重绘噪声",
	inpaintPositivePrompt: "局部重绘提示词",
	brushSize: "笔刷大小",
	brushOpacity: "笔刷不透明度",
	brushShape: "笔刷形状",
	upscaleScale: "超分倍率",
	directorTool: "导演工具",
	strength: "重绘幅度",
	noise: "噪声强度",
	extraNoiseSeed: "额外噪声种子",
	defry: "增强强度",
	colorizePrompt: "上色提示词",
	emotion: "表情类型",
	emotionLevel: "表情强度",
	language: "界面语言",
	theme: "主题",
	reduceMotion: "减少动画",
	autoComplete: "提示词补全",
	weightHighlight: "权重高亮",
	promptRandomizer: "提示词随机化",
	superDrop: "增强拖放",
	streamPreviewEnabled: "流式预览",
	showFloatingToolbar: "悬浮工具栏",
	historyJumpAfterGenerate: "生成后跳转历史",
	loggingEnabled: "记录日志",
	keepImageMetadata: "保留图片参数",
	saveToGallery: "保存到系统相册",
	autoBackupEnabled: "自动备份",
	autoBackupIntervalHours: "备份间隔（小时）",
	autoBackupRetentionCount: "保留备份数量",
	autoBackupIncludeImages: "备份包含图片",
	lockStylePrompt: "锁定风格提示词",
	lockNegativePrompt: "锁定负面提示词",
	savedStylePrompt: "已锁定的风格提示词",
	savedNegativePrompt: "已锁定的负面提示词",
	persistGenerateParams: "记住生图参数",
	persistI2IParams: "记住图生图参数",
	persistInpaintParams: "记住重绘参数",
	persistUpscaleParams: "记住超分参数",
	persistDirectorParams: "记住导演参数",
	visionApiModel: "图像识别模型",
	visionSystemPrompt: "反推系统提示词",
	convertApiModel: "提示词转换模型",
	convertSystemPrompt: "转换系统提示词",
	agentApiModel: "酒馆对话模型",
	agentProviderName: "酒馆服务商名称",
	agentContextWindow: "酒馆上下文窗口",
	agentMaxOutputTokens: "酒馆最大输出 Token",
	agentAutoCompact: "自动压缩上下文",
	agentVisionEnabled: "酒馆视觉能力",
	reversePromptMode: "反推提示词模式",
	convertMode: "转换提示词模式",
	reversePromptTemplateVersion: "反推模板版本",
	convertPromptTemplateVersion: "转换模板版本",
	reverseConvertDshEnabled: "启用酒馆提示词处理",
	reverseConvertDshMode: "酒馆处理模式",
	comicAnalyzePromptTemplate: "漫画分析模板",
	translateProvider: "翻译服务",
	translateAiModel: "翻译模型",
	stylePromptPresetSort: "风格排列顺序",
	historyRetentionDays: "图片历史保留天数",
	aitagCacheRetentionDays: "反推缓存保留天数"
};
const hints = {
	width: "按指定步长调整；模型与像素总量限制仍会检查。",
	height: "按指定步长调整；模型与像素总量限制仍会检查。",
	seed: "固定种子时便于复现；随机模式会在生成时选择新种子。",
	cfgScale: "控制提示词对图像的引导强度。",
	strength: "数值越大，重绘对原图的改动通常越明显。",
	agentMaxOutputTokens: "不应大于上下文窗口。",
	model: "切换模型后，部分不兼容参数可能需要重新选择。",
	noiseSchedule: "是否实际生效取决于所选模型。",
	savedStylePrompt: "修改前请检查风格锁定状态。",
	savedNegativePrompt: "修改前请检查负面提示词锁定状态。"
};
function fieldValue(snapshot, target, key) {
	return (target === "settings" ? snapshot.settings : target === "workbench" ? snapshot.generation : snapshot.generation?.[target])?.[key];
}
function parseValue(rule, value) {
	if (rule.enum) {
		const found = rule.enum.find((x) => String(x) === String(value));
		if (found === void 0) throw Error("请选择有效选项");
		return found;
	}
	if (rule.type === "boolean") return value === true || value === "true";
	if (rule.type === "number") {
		if (String(value).trim() === "") throw Error("请输入数值");
		const n = Number(value);
		if (!Number.isFinite(n) || n < (rule.min ?? -Infinity) || n > (rule.max ?? Infinity) || rule.step && Math.abs(n / rule.step - Math.round(n / rule.step)) > 1e-8) throw Error("数值超出范围或步长");
		return n;
	}
	return String(value);
}
const optionLabels = {
	"nai-diffusion-5-full": "NAI 5 完整版",
	"nai-diffusion-5-curated": "NAI 5 精选版",
	"random": "随机",
	"fixed": "固定",
	"increment": "递增",
	"decrement": "递减",
	"light": "浅色",
	"dark": "深色",
	"system": "跟随系统",
	"circle": "圆形",
	"square": "方形",
	"mixed": "混合提示词",
	"natural": "自然语言",
	"tags": "纯标签",
	"bg-removal": "移除背景",
	"lineart": "线稿",
	"sketch": "草图",
	"colorize": "上色",
	"emotion": "表情",
	"declutter": "清理画面",
	"native": "原生调度",
	"karras": "Karras 调度",
	"exponential": "指数调度",
	"polyexponential": "多项指数调度",
	"k_euler": "Euler",
	"k_euler_ancestral": "Euler 祖先采样",
	"k_dpmpp_2m": "DPM++ 2M",
	"k_dpmpp_2s_ancestral": "DPM++ 2S 祖先采样",
	"k_dpmpp_sde": "DPM++ SDE",
	"ddim_v3": "DDIM v3",
	"nai-diffusion-4-5-full": "NAI 4.5 完整版",
	"nai-diffusion-4-5-curated": "NAI 4.5 精选版",
	"nai-diffusion-4-full": "NAI 4 完整版",
	"nai-diffusion-4-curated-preview": "NAI 4 精选预览版",
	"nai-diffusion-3": "NAI 3",
	"nai-diffusion-furry-3": "NAI Furry 3",
	"zh-CN": "简体中文",
	"zh-TW": "繁體中文",
	"en-US": "English",
	"ja-JP": "日本語",
	"ko-KR": "한국어"
};
const shown = (v) => typeof v === "boolean" ? v ? "开启" : "关闭" : v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : optionLabels[v] ?? String(v);
function ParameterPanel({ call }) {
	(0, react.useEffect)(() => {
		const style = document.createElement("style");
		style.textContent = helpCSS;
		document.head.append(style);
		return () => style.remove();
	}, []);
	const [snapshot, setSnapshot] = (0, react.useState)(null), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [message, setMessage] = (0, react.useState)("");
	const [group, setGroup] = (0, react.useState)("params"), [query, setQuery] = (0, react.useState)(""), [edit, setEdit] = (0, react.useState)(null);
	const read = async () => {
		const next = await call("langbai_read_studio_state");
		if (!next?.writableSchema) throw Error("软件连接没有返回参数结构，请从软件内重新启动 Agent");
		setSnapshot(next);
		return next;
	};
	(0, react.useEffect)(() => {
		let live = true;
		call("langbai_read_studio_state").then((v) => {
			if (live) {
				if (!v?.writableSchema) throw Error("软件连接没有返回参数结构，请从软件内重新启动 Agent");
				setSnapshot(v);
			}
		}).catch((e) => {
			if (live) setError(e.message);
		});
		return () => {
			live = false;
		};
	}, [call]);
	(0, react.useEffect)(() => {
		if (edit || busy) return;
		return startPolling({
			read: () => call("langbai_read_studio_state"),
			publish: setSnapshot,
			onError: (e) => setError(e.message),
			isVisible: () => document.visibilityState === "visible"
		});
	}, [
		call,
		edit,
		busy
	]);
	async function run(fn) {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			await fn();
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}
	const save = () => run(async () => {
		const rule = snapshot.writableSchema[edit.target][edit.key];
		const result = await call("langbai_update_studio_config", {
			expectedRevision: edit.revision,
			target: edit.target,
			patch: { [edit.key]: parseValue(rule, edit.value) }
		});
		setEdit(null);
		await read();
		setMessage(result?.scope === "current-session" ? "已应用到当前会话并回读（重启后不保留）" : "已保存并回读软件当前值");
	});
	const search = query.trim().toLowerCase();
	return h$5("section", {
		className: "studio-library studio-parameters",
		"aria-busy": busy
	}, h$5("div", { className: "studio-library-toolbar" }, h$5("div", null, h$5("strong", null, "软件实时参数"), h$5("small", { className: "studio-library-muted" }, snapshot ? `工作台实时参数（不含设置窗口未保存草稿） · ${new Date(snapshot.capturedAt).toLocaleTimeString()}` : "正在连接本机软件…")), h$5("button", {
		disabled: busy || !!edit,
		onClick: () => run(read)
	}, "刷新")), h$5("p", { className: "studio-library-muted" }, "参数按类别展示。普通参数保存后直接生效；不会触发生成。未开放的选项请在软件设置中修改。"), error ? h$5("div", {
		role: "alert",
		className: "studio-library-error"
	}, error, h$5("button", {
		disabled: busy,
		onClick: () => run(async () => {
			await read();
			setEdit(null);
		})
	}, "刷新并取消当前编辑")) : null, message ? h$5("p", { role: "status" }, message) : null, h$5("input", {
		"aria-label": "搜索参数",
		placeholder: "搜索名称或字段，例如：种子 / CFG / 模型",
		value: query,
		onChange: (e) => setQuery(e.target.value)
	}), h$5("nav", {
		className: "studio-parameter-tabs",
		"aria-label": "参数类别"
	}, ...Object.keys(snapshot?.writableSchema ?? groups).map((k) => h$5("button", {
		key: k,
		"aria-pressed": k === group,
		onClick: () => setGroup(k)
	}, groups[k] ?? k))), ...Object.entries(snapshot?.writableSchema ?? {}).filter(([k]) => search || k === group).map(([target, rules]) => h$5("section", { key: target }, search ? h$5("h3", null, groups[target] ?? target) : null, h$5("div", { className: "studio-parameter-fields" }, ...Object.entries(rules).filter(([key]) => !(target === "params" && key === "positivePrompt")).filter(([key]) => !search || `${labels[key] ?? ""} ${key}`.toLowerCase().includes(search)).map(([key, rule]) => {
		const active = edit?.target === target && edit.key === key, value = fieldValue(snapshot, target, key), options = rule.enum ?? (rule.type === "boolean" ? [true, false] : null);
		const control = options ? h$5("select", {
			"aria-label": labels[key] ?? key,
			value: String(active ? edit.value : value),
			disabled: busy || !!edit && !active,
			onChange: (e) => setEdit({
				target,
				key,
				revision: edit?.revision ?? snapshot.revision,
				value: e.target.value
			})
		}, ...options.map((v) => h$5("option", {
			key: String(v),
			value: String(v)
		}, key === "upscaleScale" && (v === 0 || v === "max") ? "MAX" : shown(v)))) : h$5(rule.type === "string" ? "textarea" : "input", {
			"aria-label": labels[key] ?? key,
			type: rule.type === "number" ? "number" : void 0,
			rows: 3,
			value: (active ? edit.value : value) ?? "",
			min: rule.min,
			max: rule.type === "number" ? rule.max : void 0,
			step: rule.step ?? "any",
			disabled: busy || !!edit && !active,
			onChange: (e) => setEdit({
				target,
				key,
				revision: edit?.revision ?? snapshot.revision,
				value: e.target.value
			})
		});
		return h$5("article", {
			key,
			className: "studio-parameter-card"
		}, h$5("div", { className: "studio-library-toolbar" }, h$5("strong", null, labels[key] ?? key), h$5(ParameterHelp, {
			name: labels[key] ?? key,
			field: key,
			rule
		})), rule.type === "number" ? h$5("small", null, `范围 ${rule.min ?? "不限"}–${rule.max ?? "不限"}${rule.step ? ` · 步长 ${rule.step}` : ""}`) : null, rule.persistence === "session" ? h$5("small", null, "仅当前会话 · 重启后不保留") : null, hints[key] ? h$5("p", { className: "studio-library-muted" }, hints[key]) : null, control, h$5("div", { className: "studio-parameter-actions" }, active ? h$5(react.default.Fragment, null, h$5("button", {
			disabled: busy,
			onClick: () => setEdit(null)
		}, "取消"), h$5("button", {
			disabled: busy,
			onClick: save
		}, busy ? "保存中…" : "保存此项")) : null));
	})))));
}
//#endregion
//#region harness/plugins/studio-library/api-credential-ui.js
const h$4 = react.default.createElement;
function ApiCredentialInput({ call, sessionId }) {
	const [pending, setPending] = (0, react.useState)(null), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)("");
	const box = (0, react.useRef)(null), input = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		let alive = true, running = false;
		setPending(null);
		setError("");
		if (!sessionId) return;
		const read = async () => {
			if (running) return;
			running = true;
			try {
				const next = await call("studio_api_input", { sessionId });
				if (alive) setPending(next);
			} catch {
				if (alive) setError("私密输入状态读取失败，请稍后重试。");
			} finally {
				running = false;
			}
		};
		read();
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") read();
		}, 1500);
		return () => {
			alive = false;
			clearInterval(timer);
			if (input.current) input.current.value = "";
		};
	}, [call, sessionId]);
	(0, react.useEffect)(() => {
		if (!pending) return;
		const previous = document.activeElement;
		input.current?.focus();
		return () => {
			if (input.current) input.current.value = "";
			if (previous?.isConnected) previous.focus();
		};
	}, [pending?.id]);
	async function submit(cancel = false) {
		if (busy) return;
		setBusy(true);
		setError("");
		const value = input.current?.value ?? "";
		try {
			await call("studio_resolve_api_input", {
				sessionId,
				id: pending.id,
				...cancel ? { cancel: true } : { value }
			});
			setPending(null);
		} catch {
			setError("保存未完成，请重新读取 API 配置后再操作；密钥不会显示在聊天中。");
		} finally {
			if (input.current) input.current.value = "";
			setBusy(false);
		}
	}
	if (!pending) return null;
	return h$4("div", { className: "studio-approval-shade" }, h$4("form", {
		ref: box,
		className: "studio-library studio-approval-card",
		role: "dialog",
		"aria-modal": true,
		"aria-label": "私密填写 API 密钥",
		"aria-busy": busy,
		onSubmit: (e) => {
			e.preventDefault();
			submit();
		},
		onKeyDown: (e) => {
			if (e.key === "Escape" && !busy) {
				e.preventDefault();
				submit(true);
			}
			if (e.key === "Tab") {
				const list = [...box.current.querySelectorAll("button:not(:disabled),input:not(:disabled)")], first = list[0], last = list.at(-1);
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first?.focus();
				}
			}
		}
	}, h$4("h3", null, "私密填写 API 密钥"), h$4("div", { className: "studio-approval-body" }, h$4("p", null, pending.title), h$4("p", null, "只保存到本机软件的凭据存储，不发送给对话模型，不写入聊天记录。保存不会调用收费接口。"), h$4("label", null, "API 密钥", h$4("input", {
		ref: input,
		type: "password",
		name: "studio-private-key",
		autoComplete: "new-password",
		autoCorrect: "off",
		spellCheck: false,
		required: true,
		maxLength: 8192,
		disabled: busy,
		style: {
			width: "100%",
			minHeight: 44,
			boxSizing: "border-box",
			font: "inherit"
		},
		"aria-label": "API 密钥"
	})), error ? h$4("p", { role: "alert" }, error) : null), h$4("div", { className: "studio-library-toolbar" }, h$4("button", {
		type: "button",
		disabled: busy,
		onClick: () => submit(true)
	}, "取消"), h$4("button", {
		type: "submit",
		disabled: busy
	}, busy ? "正在保存…" : "保存到本机"))));
}
//#endregion
//#region harness/plugins/studio-library/approval-summary.js
const categoryLabels = {
	tavernAgent: "酒馆 Agent",
	styleLab: "画风实验室",
	configuration: "软件配置",
	apiCredentials: "API 凭据（含密钥）",
	artistLibrary: "画师与收藏",
	textHistory: "提示词历史",
	referencePresets: "参考图预设",
	imageHistory: "图片与生成历史",
	promptPresets: "提示词与风格预设",
	agentWorkspace: "角色与对话资料",
	workspaceData: "工具项目",
	characters: "角色卡",
	personas: "用户人设",
	lorebooks: "世界书",
	samplerPresets: "采样预设",
	styles: "风格预设",
	positivePresets: "正面提示词预设"
};
function approvalSummary(pending) {
	const p = pending.parameters ?? {};
	if (pending.tool === "langbai_software_action" && ["comic.generation.start", "batch.generation.start"].includes(p.action)) {
		const count = p.plannedImages ?? p.count;
		return {
			title: p.action === "batch.generation.start" ? "确认批量重绘" : "确认漫画整批生图",
			description: p.imageProvider === "openai-images" ? "本次确认覆盖整批兼容图片服务生成，费用以服务商为准；软件不会再次逐张确认。失败会停止后续提交，已生成图片保留。" : "本次确认覆盖整批图片生成，可能消耗 Anlas；软件不会再次逐张确认。失败会停止后续提交，已生成图片保留。",
			target: [
				p.imageProvider === "openai-images" ? p.model : null,
				p.imageProvider === "openai-images" ? p.size : null,
				p.projectTitle,
				(p.action === "batch.generation.start" ? {
					all: "所选图片全部重绘",
					pending: "未完成图片",
					failed: "失败图片",
					additional: "每图追加一张"
				} : {
					initial: "补足初始候选",
					regenerate: "重做候选",
					additional: "每格追加一张"
				})[p.mode],
				Number.isSafeInteger(count) && count > 0 ? `${count} 张图片` : "请核对计划张数",
				p.imageProvider !== "openai-images" && Number.isFinite(p.estimatedAnlas) ? `预估 ${p.estimatedAnlas} Anlas` : null
			].filter(Boolean).join(" · "),
			confirm: "确认本批生成"
		};
	}
	if (pending.tool === "langbai_software_action" && [
		"comic.project.new",
		"comic.project.import",
		"comic.panels.replace",
		"comic.panels.remove"
	].includes(p.action)) return {
		title: p.title ?? "修改漫画工程",
		description: "本次修改前保存工程快照；已有图片文件保留，不重新生成。确认后替换对应工程或分镜记录。",
		target: p.id ?? "当前漫画工程",
		confirm: "确认修改工程"
	};
	if (pending.tool === "langbai_software_action" && ["favorites.local.remove", "favorites.online.remove"].includes(p.action)) return {
		title: "移出收藏",
		description: p.action === "favorites.local.remove" ? "只移除收藏记录，原图和收藏目录中的图片都保留。" : "只移除在线书签，不影响本地收藏和生成图片。",
		target: p.id ?? "",
		confirm: "确认移出收藏"
	};
	if (pending.tool === "langbai_software_action" && p.action === "navigation.reset") return {
		title: "恢复顶栏默认顺序",
		description: "只恢复功能标签排列，不删除收藏、图片、参数或对话。",
		target: "软件顶栏",
		confirm: "恢复默认顺序"
	};
	if (pending.tool === "langbai_software_action" && p.action === "app.update.install" && p.platform === "android") return {
		title: "更新 Android 软件",
		description: "一次确认包括下载、完整性校验、停止当前 Agent 和安装交接。对话和图片保留；Android 系统可能要求安装权限或确认。打开安装器不代表更新成功，重新打开软件后核对版本。",
		target: [
			`${p.currentVersion ?? ""} → ${p.version ?? ""}`,
			Number.isFinite(p.downloadBytes) ? `${(p.downloadBytes / 1048576).toFixed(1)} MiB` : null,
			p.sourceUrl
		].filter(Boolean).join(" · "),
		confirm: "确认更新软件"
	};
	if (pending.tool === "langbai_software_action" && p.action === "app.update.install") return {
		title: "更新软件并自动重启",
		description: "一次确认包括下载、完整性校验、停止当前任务和安装重启。对话和图片保留；安装程序启动不等于更新完成，重启后核对版本。",
		target: [
			`${p.currentVersion ?? ""} → ${p.version ?? ""}`,
			Number.isFinite(p.downloadBytes) ? `${(p.downloadBytes / 1048576).toFixed(1)} MiB` : null,
			p.sourceUrl
		].filter(Boolean).join(" · "),
		confirm: "确认更新并重启"
	};
	if (pending.tool === "langbai_software_action" && String(p.action).startsWith("resources.")) {
		const r = p.resource ?? {}, download = p.action === "resources.download", remove = p.action === "resources.delete";
		return {
			title: download ? "下载并安装资源数据库" : remove ? "删除本机资源数据库" : "恢复上一版资源数据库",
			description: (download ? "将下载并验证完整性，再替换数据库；旧版保留用于恢复。" : remove ? "删除此资源数据库、旧版与下载断点。" : "用已保留的旧版替换当前资源数据库。") + " 不改动图片、角色、预设或对话。",
			target: [
				r.label ?? p.id,
				download && Number.isFinite(r.downloadBytes) ? `${(r.downloadBytes / 1048576).toFixed(1)} MiB` : null,
				r.sourceUrl,
				r.license
			].filter(Boolean).join(" · "),
			confirm: download ? "确认下载安装" : remove ? "确认删除" : "确认恢复"
		};
	}
	if (p.templateWorkflow) return {
		title: "确认本次模板生图任务",
		description: "一次确认包含提示词转换、最多两次格式校正，以及所列张数的生图；可能产生模型费用和 Anlas 消耗。校验失败会停止，不重复弹确认。",
		target: p.description ?? "",
		confirm: "确认本次任务"
	};
	if (pending.tool === "studio_material_confirm") return {
		title: "应用本机资料到当前会话",
		description: "创建或复用酒馆副本，再绑定当前会话；原本机资料与其他会话保持不变。" + (Array.isArray(p.warnings) ? p.warnings.join("；") : ""),
		target: [categoryLabels[p.collection], p.name].filter(Boolean).join(" · "),
		confirm: "确认应用"
	};
	if (pending.tool === "langbai_templates") return {
		title: p.action === "restore" ? "恢复内置提示词模板" : "保存软件提示词模板",
		description: "执行前备份配置；仅修改所选用途、版本和模式，不生成图片。",
		target: [
			p.kind === "reverse" ? "图片反推" : "提示词转换",
			p.templateVersion,
			{
				mixed: "混合模式",
				tags: "标签模式",
				natural: "自然语言"
			}[p.mode]
		].filter(Boolean).join(" · "),
		confirm: p.action === "restore" ? "确认恢复" : "确认保存"
	};
	if (pending.tool === "langbai_api") return {
		title: p.action === "clearCredential" ? "清除 API 凭据" : "保存 API 配置",
		description: p.action === "clearCredential" ? "清除后相关服务需要重新填写凭据；不会删除对话或图片。" : "现有凭据将用于本次设置的服务地址。请核对地址；保存不会自动调用收费接口。",
		target: [
			p["名称"],
			p["修改"]?.baseUrl,
			p["修改"]?.imageUrl
		].filter(Boolean).join(" · "),
		confirm: p.action === "clearCredential" ? "确认清除" : "确认保存"
	};
	if (pending.tool === "langbai_backup") return {
		title: p.action === "restore" ? "恢复所选备份" : "导出含凭据的备份",
		description: p.action === "restore" ? "先保存恢复前备份，再合并所选资料；所选配置会覆盖，设备路径保留。" : "文件只保存到本机，不上传；包含密钥，请妥善保存。",
		target: p["备份"] ?? "",
		categories: Array.isArray(p.categories) ? p.categories.map((x) => categoryLabels[x] ?? x).join("、") : "",
		confirm: p.action === "restore" ? "确认恢复" : "确认备份"
	};
	if (pending.tool === "langbai_library") return {
		title: p.action === "delete" ? "删除所选资料" : "保存资料修改",
		description: "执行前创建可恢复备份。保留图片文件，不自动生成图片。",
		target: [categoryLabels[p.collection] ?? p.collection, p["名称"] ?? p.id].filter(Boolean).join(" · "),
		confirm: p.action === "delete" ? "确认删除" : "确认保存"
	};
	if (pending.tool === "langbai_tasks") return {
		title: p.action === "resume" ? "继续生成队列" : "移除排队任务",
		description: p.action === "resume" ? "继续执行尚未完成的排队任务，可能消耗 Anlas。" : "仅移除待执行任务，已生成的图片保留。",
		target: p.id ?? "",
		confirm: p.action === "resume" ? "确认继续" : "确认移除"
	};
	return {
		title: pending.title ?? "确认软件操作",
		description: pending.kind === "operation" ? "请检查本次操作内容。确认后执行一次，软件不再重复确认。" : `当前会话请求 ${pending.count} 张图片处理任务，可能消耗 Anlas。`,
		target: "",
		confirm: pending.kind === "operation" ? "确认执行" : "确认生成"
	};
}
//#endregion
//#region harness/plugins/studio-library/image-approval.js
const h$3 = react.default.createElement;
function ImageApproval({ call, sessionId }) {
	const box = (0, react.useRef)(null);
	const [pending, setPending] = (0, react.useState)(null), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)("");
	(0, react.useEffect)(() => {
		let live = true, inflight = false;
		setPending(null);
		setError("");
		if (!sessionId) return;
		const read = async () => {
			if (inflight) return;
			inflight = true;
			try {
				const item = await call("studio_image_approval", { sessionId });
				if (live) setPending(item);
			} catch (e) {
				if (live) setError(e.message);
			} finally {
				inflight = false;
			}
		};
		read();
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") read();
		}, 1500);
		return () => {
			live = false;
			clearInterval(timer);
		};
	}, [call, sessionId]);
	(0, react.useEffect)(() => {
		if (!pending) return;
		const previous = document.activeElement;
		box.current?.querySelector("button")?.focus();
		return () => {
			if (previous?.isConnected) previous.focus();
		};
	}, [pending?.id]);
	async function decide(approved) {
		setBusy(true);
		setError("");
		try {
			await call("studio_resolve_image_approval", {
				sessionId,
				id: pending.id,
				approved
			});
			setPending(null);
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	}
	if (!pending) return null;
	const summary = approvalSummary(pending);
	return h$3("div", { className: "studio-approval-shade" }, h$3("section", {
		ref: box,
		className: "studio-library studio-approval-card",
		role: "dialog",
		"aria-modal": true,
		"aria-label": summary.title,
		"aria-busy": busy,
		onKeyDown: (e) => {
			if (e.key === "Escape" && !busy) {
				e.preventDefault();
				decide(false);
			}
			if (e.key === "Tab") {
				const list = [...box.current.querySelectorAll("button:not(:disabled),summary")];
				const first = list[0], last = list.at(-1);
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first?.focus();
				}
			}
		}
	}, h$3("h3", null, summary.title), h$3("div", { className: "studio-approval-body" }, h$3("p", null, summary.description), summary.target ? h$3("p", null, summary.target) : null, summary.categories ? h$3("p", null, "所选资料：" + summary.categories) : null, h$3("details", null, h$3("summary", null, "查看本次参数"), h$3("p", { className: "studio-library-muted" }, pending.tool), h$3("pre", { style: {
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere"
	} }, JSON.stringify(pending.parameters, null, 2))), error ? h$3("p", { role: "alert" }, error) : null), h$3("div", { className: "studio-library-toolbar" }, h$3("button", {
		disabled: busy,
		onClick: () => decide(false)
	}, "取消"), h$3("button", {
		disabled: busy,
		onClick: () => decide(true)
	}, busy ? "正在提交…" : summary.confirm))));
}
const approvalCSS = `.studio-approval-shade{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:12px;background:rgb(0 0 0 / .2)}.studio-approval-card{width:min(480px,100%);max-height:80dvh;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#171717);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:14px;padding:20px;overflow-wrap:anywhere}.studio-approval-card h3{flex-shrink:0;margin:0 0 12px}.studio-approval-body{min-height:0;overflow:auto}.studio-approval-card .studio-library-toolbar{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;flex-shrink:0;border-top:1px solid var(--dsw-alias-border-l2,#ddd);padding-top:12px;margin-top:12px}.studio-approval-card button{min-height:44px;min-width:80px;font:inherit;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:6px;padding:7px 12px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));color:inherit;cursor:pointer}.studio-approval-card button:focus-visible,.studio-approval-card summary:focus-visible{outline:2px solid currentColor;outline-offset:2px}.studio-approval-card summary{min-height:44px;display:flex;align-items:center;cursor:pointer}`;
//#endregion
//#region harness/plugins/studio-library/template-panel.js
const h$2 = react.default.createElement;
function TemplatePanel({ call }) {
	const fileInput = (0, react.useRef)(null);
	const [kind, setKind] = (0, react.useState)("convert"), [mode, setMode] = (0, react.useState)(null), [version, setVersion] = (0, react.useState)(null);
	const [snapshot, setSnapshot] = (0, react.useState)(null), [body, setBody] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [message, setMessage] = (0, react.useState)("");
	(0, react.useEffect)(() => {
		let live = true;
		setSnapshot(null);
		setError("");
		call("studio_prompt_template", {
			kind,
			...mode ? { mode } : {},
			...version ? { templateVersion: version } : {}
		}).then((s) => {
			if (live) {
				setSnapshot(s);
				setBody(s.body);
			}
		}).catch((e) => {
			if (live) setError(e.message);
		});
		return () => {
			live = false;
		};
	}, [
		call,
		kind,
		mode,
		version
	]);
	const save = async (reset = false) => {
		setBusy(true);
		setError("");
		try {
			const s = await call("studio_save_prompt_template", {
				kind: snapshot.kind,
				mode: snapshot.mode,
				templateVersion: snapshot.templateVersion,
				expectedRevision: snapshot.revision,
				body: reset ? "" : body,
				restoreDefault: reset
			});
			setSnapshot(s);
			setBody(s.body);
			setMessage("已保存到软件共用模板；下一次提示词请求生效，未生成图片。");
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	};
	async function importFile(event) {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setError("");
		try {
			if (file.size > 24e4) throw Error("模板文件过大");
			let value = await file.text();
			if (file.name.toLowerCase().endsWith(".json")) {
				const json = JSON.parse(value);
				value = typeof json === "string" ? json : json.body ?? json[snapshot.mode];
			}
			if (typeof value !== "string" || !value.trim() || value.length > 6e4) throw Error("请导入 TXT 文本或包含 body / 当前模式字段的 JSON");
			setBody(value);
			setMessage("已载入草稿；检查后点击保存，不会自动覆盖模板。");
		} catch (e) {
			setError(e.message);
		}
	}
	return h$2("section", { className: "studio-library" }, h$2("h3", null, "软件共用提示词模板"), h$2("p", { className: "studio-library-muted" }, "文字描述使用转换模板，参考图使用反推模板。默认混合模式；导入和编辑保存到软件同一套模板，风格与负面提示词不变。"), h$2("div", { className: "studio-library-toolbar" }, h$2("label", null, "用途 ", h$2("select", {
		value: kind,
		disabled: busy,
		onChange: (e) => {
			setKind(e.target.value);
			setVersion(null);
			setMessage("");
		}
	}, h$2("option", { value: "convert" }, "文字转换"), h$2("option", { value: "reverse" }, "图片反推"))), h$2("label", null, "模式 ", h$2("select", {
		value: mode ?? snapshot?.mode ?? "mixed",
		disabled: busy,
		onChange: (e) => {
			setMode(e.target.value);
			setMessage("");
		}
	}, h$2("option", { value: "mixed" }, "混合模式"), h$2("option", { value: "tags" }, "标签"), h$2("option", { value: "natural" }, "自然语言"))), h$2("label", null, "版本 ", h$2("select", {
		value: version ?? snapshot?.templateVersion ?? "v5",
		disabled: busy,
		onChange: (e) => {
			setVersion(e.target.value);
			setMessage("");
		}
	}, h$2("option", { value: "v5" }, "V5"), h$2("option", { value: "v4.5" }, "V4.5")))), snapshot ? h$2(react.default.Fragment, null, h$2("p", null, snapshot.source === "custom" ? "当前内容：软件自定义模板" : "当前内容：软件内置模板"), h$2("textarea", {
		"aria-label": "共用模板内容",
		rows: 12,
		value: body,
		disabled: busy,
		onChange: (e) => setBody(e.target.value),
		style: {
			width: "100%",
			boxSizing: "border-box"
		}
	}), h$2("div", { className: "studio-library-toolbar" }, h$2("input", {
		ref: fileInput,
		type: "file",
		accept: ".txt,.json",
		hidden: true,
		disabled: busy,
		onChange: importFile
	}), h$2("button", {
		disabled: busy,
		onClick: () => fileInput.current?.click()
	}, "导入模板文件"), h$2("button", {
		disabled: busy,
		onClick: () => save()
	}, "保存模板与选择"), h$2("button", {
		disabled: busy,
		onClick: () => save(true)
	}, "恢复当前模式默认模板"))) : h$2("p", null, error ? "模板读取未完成" : "读取本机软件模板…"), error ? h$2("p", { role: "alert" }, error) : null, message ? h$2("p", { role: "status" }, message) : null);
}
//#endregion
//#region harness/plugins/studio-library/jev-client.js
const h$1 = react.default.createElement;
function JevSettings({ call }) {
	const [state, setState] = (0, react.useState)(null), [enabled, setEnabled] = (0, react.useState)(false), [key, setKey] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [message, setMessage] = (0, react.useState)("");
	(0, react.useEffect)(() => {
		let live = true;
		call("studio_jev_status").then((v) => {
			if (live) {
				setState(v);
				setEnabled(v.enabled);
			}
		}).catch((e) => {
			if (live) setMessage(e.message);
		});
		return () => {
			live = false;
		};
	}, [call]);
	const save = async () => {
		setBusy(true);
		setMessage("");
		try {
			const next = await call("studio_jev_configure", {
				revision: state.revision,
				enabled,
				...key.trim() ? { apiKey: key } : {}
			});
			setState(next);
			setKey("");
			setMessage(next.enabled ? "已保存：后续提示词调用将使用 Jev 筛选。" : "已保存：Jev 已关闭，后续仍可生成混合提示词，不请求 Jev。");
		} catch (e) {
			setMessage(e.message);
		} finally {
			setBusy(false);
		}
	};
	return h$1("section", { className: "studio-library" }, h$1("h3", null, "高级候选分析（Jev，可选）"), h$1("p", null, "常规生图使用上方的软件共用模板；只有主动要求高级候选分析时才使用本节流程。描述或图片 → 语言模型整理 Tag 与英文关系短语 → 可选 Jev 核验 → 按画面主次增减权重 → 混合提示词。"), h$1("p", { className: "studio-library-muted" }, "文字输入适度补全：主动补充适用的服装、视角、景别、光线、姿势、表情和动作细节，保持主体与原场景不变，不擅自增加天气、时间或剧情。图片反推仅依据可见证据，不补不可见细节。Tag 表达元素，英文自然语言补足位置、持物、注视与遮挡关系；约 80/20 为参考，不机械凑比例。固定风格和负面提示词不变。多数词默认权重，明确重点及必要构图补全可适当加强，辅助细节可轻微降权；不自动削弱用户明确要求，也不为凑高低权重而强行调整。Jev 评分不直接等于生图权重，不承诺一次生成完美图片。"), h$1("label", { className: "studio-library-toolbar" }, h$1("input", {
		type: "checkbox",
		style: { width: "auto" },
		checked: enabled,
		disabled: busy || !state,
		onChange: (e) => setEnabled(e.target.checked)
	}), "启用 Jev 筛选（可选，保存后生效）"), h$1("p", { className: "studio-library-muted" }, "关闭后仍生成混合提示词，保留适度补全和增减权重，只跳过 Jev 语义筛选；不产生 Jev 接口费用。当前语言模型仍可能产生费用。开关和密钥会保存，关闭不会删除密钥。"), h$1("label", { className: "studio-library-field" }, "DefAPI API Key（仅开启 Jev 时需要）", h$1("input", {
		type: "password",
		autoComplete: "new-password",
		value: key,
		disabled: busy,
		placeholder: state?.configured ? "已配置，留空保留原密钥" : "输入 DefAPI 密钥",
		onChange: (e) => setKey(e.target.value)
	})), h$1("p", { className: "studio-library-muted" }, "模型：typesafe/jev-1.13；请求发送到 api.defapi.org。仅发送本次描述、规划、候选词、关系短语，以及反推时的文字观察；不向 Jev 发送图片、聊天记录、软件配置或风格库。调用可能产生接口费用。"), h$1("button", {
		disabled: busy || !state,
		onClick: save
	}, busy ? "保存中…" : "保存配置"), message ? h$1("p", { role: "status" }, message) : null);
}
//#endregion
//#region harness/plugins/studio-library/file-links.js
function installFileLinks(root, call) {
	let closed = false, queued = false;
	const records = /* @__PURE__ */ new Map();
	let label = "打开所在文件夹并选中图片", openedText = "已请求打开所在文件夹";
	const filePath = (node) => {
		const value = node.textContent?.trim() ?? "";
		return value.length <= 4096 && /^(?:[A-Za-z]:[\\/]|\/)[^\r\n\x00]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(value) ? value : null;
	};
	function scan() {
		queued = false;
		if (closed) return;
		for (const [node, dispose] of records) if (!node.isConnected || !filePath(node)) {
			dispose();
			records.delete(node);
		}
		for (const node of root.querySelectorAll("code")) {
			if (records.has(node) || node.closest("pre,button,a,[contenteditable=\"true\"],.studio-library")) continue;
			if (!filePath(node)) continue;
			const prior = {
				role: node.getAttribute("role"),
				tabindex: node.getAttribute("tabindex"),
				title: node.getAttribute("title")
			};
			node.setAttribute("role", "button");
			node.setAttribute("tabindex", "0");
			node.setAttribute("title", label);
			node.classList.add("studio-file-link");
			const status = document.createElement("span");
			status.className = "studio-file-link-status";
			status.setAttribute("role", "status");
			node.after(status);
			let busy = false;
			const open = async (event) => {
				if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
				event.preventDefault();
				if (busy) return;
				const value = filePath(node);
				if (!value) return;
				busy = true;
				node.setAttribute("aria-busy", "true");
				status.textContent = " 正在打开…";
				try {
					await call("studio_reveal_image", {
						action: "reveal",
						filePath: value
					});
					status.textContent = " " + openedText;
				} catch (error) {
					status.textContent = " " + error.message;
				} finally {
					busy = false;
					node.removeAttribute("aria-busy");
				}
			};
			node.addEventListener("click", open);
			node.addEventListener("keydown", open);
			records.set(node, () => {
				node.removeEventListener("click", open);
				node.removeEventListener("keydown", open);
				node.classList.remove("studio-file-link");
				for (const [key, value] of Object.entries(prior)) value === null ? node.removeAttribute(key) : node.setAttribute(key, value);
				status.remove();
			});
		}
	}
	const observer = new MutationObserver(() => {
		if (!queued) {
			queued = true;
			queueMicrotask(scan);
		}
	});
	call("studio_reveal_image", { action: "capabilities" }).then((data) => {
		if (closed || !data?.reveal) return;
		if (typeof data.label === "string" && data.label.length <= 80) label = data.label;
		if (typeof data.openedText === "string" && data.openedText.length <= 120) openedText = data.openedText;
		scan();
		observer.observe(root, {
			childList: true,
			subtree: true,
			characterData: true
		});
	}).catch(() => {});
	return () => {
		closed = true;
		observer.disconnect();
		for (const dispose of records.values()) dispose();
		records.clear();
	};
}
const fileLinkCSS = ".studio-file-link{cursor:pointer;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.studio-file-link:focus-visible{outline:2px solid currentColor;outline-offset:3px}.studio-file-link-status{font-size:.85em;opacity:.8;overflow-wrap:anywhere}";
//#endregion
//#region harness/plugins/studio-library/protocol.js
const stringSchema = { parse(value) {
	if (typeof value !== "string" || value.length > 2e6) throw new Error("Invalid Studio RPC value");
	return value;
} };
const packageName = "@langbai/dsh-studio-library";
const descriptor = {
	id: "@langbai/dsh-studio-library#studioLibrary/call",
	service: "studioLibrary",
	namespace: "studioLibrary",
	method: "call",
	invocation: { kind: "direct" },
	parameters: [
		"tool",
		"payload",
		"callId"
	].map((name) => ({
		name,
		wire: name,
		source: "json",
		codec: {
			mode: "strict",
			typeSymbol: "@langbai/dsh-studio-library#" + name,
			schema: stringSchema,
			create: () => stringSchema
		}
	})),
	cancellation: { parameter: "signal" },
	result: {
		mode: "strict",
		typeSymbol: "@langbai/dsh-studio-library#result",
		schema: stringSchema,
		create: () => stringSchema
	}
};
const allowedTools = new Set([
	"studio_session_material",
	"studio_api_input",
	"studio_resolve_api_input",
	"langbai_read_studio_state",
	"langbai_list_studio_data",
	"langbai_update_studio_config",
	"langbai_save_style_preset",
	"langbai_import_studio_data"
]);
allowedTools.add("studio_reveal_image");
for (const name of [
	"studio_session_state",
	"studio_set_session_style",
	"studio_generation_policy",
	"studio_style_preview",
	"studio_stop_generation",
	"studio_workspaces",
	"studio_cleanup_empty_workspaces"
]) allowedTools.add(name);
for (const name of [
	"studio_image_approval",
	"studio_resolve_image_approval",
	"studio_prompt_template",
	"studio_save_prompt_template",
	"studio_panel_layout",
	"studio_save_panel_layout"
]) allowedTools.add(name);
//#endregion
//#region harness/plugins/studio-library/client.js
const h = react.default.createElement;
const inject = ["remote", "slots"];
async function apply(ctx) {
	const dispose = await ctx.remote.$mount({
		package: packageName,
		descriptors: [descriptor]
	});
	const remote = ctx.get("remote.studioLibrary");
	const call = async (tool, args = {}) => {
		const response = await remote.call(tool, JSON.stringify(args), crypto.randomUUID());
		if (!response.ok) throw new Error(response.error.message);
		const result = JSON.parse(response.value);
		if (!result.ok) throw new Error(result.error ?? result.output ?? "操作失败");
		return result.data;
	};
	ctx.effect(() => {
		const style = document.createElement("style");
		style.textContent = CSS + floatingPanelCSS + approvalCSS + fileLinkCSS;
		document.head.append(style);
		return () => style.remove();
	});
	ctx.effect(() => installFileLinks(document.body, call));
	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
		name: "shell.overlay",
		id: "studio-library-navigation",
		order: 15,
		children: {
			"studio.extensions.content": {
				kind: "list",
				scope: "root"
			},
			"studio.extensions.page": {
				kind: "list",
				scope: "root"
			}
		}
	}, (props) => h(Navigation, {
		...props,
		call,
		getMarket: () => ctx.get("market"),
		getMemory: () => ctx.get("remote.mindspaceSessionMemory")
	})));
	return dispose;
}
function Navigation({ call, renderSlot, getMarket, getMemory, useSessions }) {
	const sessionId = useSessions(selectedSession);
	const [tab, setTab] = (0, react.useState)(null), [expanded, setExpanded] = (0, react.useState)(false);
	return h(react.default.Fragment, null, h(ImageApproval, {
		key: sessionId ?? "none",
		call,
		sessionId
	}), h(ApiCredentialInput, {
		key: "api-" + (sessionId ?? "none"),
		call,
		sessionId
	}), h("div", { className: "studio-extension-anchor" }, h("button", {
		type: "button",
		className: "studio-extension-trigger",
		"aria-expanded": expanded,
		"aria-controls": "studio-extension-menu",
		onClick: () => setExpanded((v) => !v)
	}, "扩展", h(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 14 })), expanded ? h("button", {
		className: "studio-extension-dismiss",
		"aria-label": "关闭扩展菜单",
		onClick: () => setExpanded(false)
	}) : null, h("div", {
		id: "studio-extension-menu",
		className: "studio-extension-menu",
		hidden: !expanded,
		onKeyDown: (e) => {
			if (e.key === "Escape") {
				setExpanded(false);
				e.currentTarget.parentElement.querySelector(".studio-extension-trigger")?.focus();
			}
		},
		onClick: (e) => {
			if (e.target.closest("button")) setExpanded(false);
		}
	}, h("div", { className: "studio-extension-heading" }, "酒馆与软件"), renderSlot("studio.extensions.content", { wide: true }), h("div", { className: "studio-library-nav" }, ...[
		"软件参数",
		"风格管理",
		"记忆中心",
		"插件管理",
		"插件市场",
		"智能提示词",
		"本机资料 / 导入导出",
		"工作区整理"
	].map((title, i) => h("button", {
		key: title,
		type: "button",
		"aria-label": title,
		onClick: () => setTab(i)
	}, title))))), tab === 0 ? h(FloatingPanel, {
		call,
		onClose: () => setTab(null)
	}, h(SessionControls, {
		key: sessionId ?? "none",
		call,
		sessionId,
		onStyles: () => setTab(1)
	}), h(ParameterPanel, { call })) : null, h(_deepseek_ai_dsh_client_ui_primitives.Modal, {
		open: tab !== null && tab !== 0,
		onClose: () => setTab(null),
		title: [
			"软件参数",
			"风格管理",
			"记忆中心",
			"插件管理",
			"插件市场",
			"智能提示词",
			"本机资料 / 导入导出",
			"工作区整理"
		][tab] ?? "",
		closeLabel: "关闭软件面板",
		className: "studio-library-modal"
	}, tab === 7 ? h(Workspaces, { call }) : tab === 6 ? h(LocalDataPanel, {
		key: sessionId ?? "none",
		call,
		sessionId
	}) : tab === 1 ? h(Library, {
		key: sessionId ?? "none",
		tab,
		call,
		sessionId
	}) : tab === 2 ? h(MemoryPanel, {
		key: sessionId ?? "none",
		remote: getMemory(),
		sessionId
	}) : tab === 3 ? renderSlot("studio.extensions.page", {}, { only: "installed-manager" }) : tab === 4 ? getMarket()?.render?.({ close: () => setTab(null) }) ?? h("p", null, "插件市场已安装时，重启酒馆 Agent 后即可使用。") : tab === 5 ? h(react.default.Fragment, null, h(TemplatePanel, { call }), h(JevSettings, { call })) : null));
}
function StudioSelect({ label, value, options, onChange, disabled }) {
	const [open, setOpen] = (0, react.useState)(false);
	const selected = options.find((x) => String(x.value) === String(value));
	return h(_deepseek_ai_dsh_client_ui_primitives.Menu, {
		open: open && !disabled,
		portal: true,
		dense: true,
		className: "studio-select-menu",
		items: options.map((x) => ({
			id: String(x.value),
			label: x.label
		})),
		selectedId: String(value),
		onClose: () => setOpen(false),
		onSelect: (id) => {
			onChange(id);
			setOpen(false);
		},
		anchor: h("button", {
			type: "button",
			className: "studio-select-trigger",
			"aria-label": label,
			"aria-haspopup": "menu",
			"aria-expanded": open && !disabled,
			disabled,
			onClick: () => setOpen((v) => !v)
		}, h("span", null, selected?.label ?? String(value)), h(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 14 }))
	});
}
const FIELD_LABELS = {
	model: "模型",
	stylePrompt: "风格提示词",
	positivePrompt: "正面提示词",
	negativePrompt: "负面提示词",
	width: "宽度",
	height: "高度",
	steps: "采样步数",
	cfgScale: "提示词相关度",
	cfgRescale: "相关度修正",
	sampler: "采样器",
	noiseSchedule: "噪声调度",
	seed: "种子",
	seedMode: "种子模式",
	ucPreset: "负面预设",
	qualityPreset: "质量预设",
	qualityToggle: "质量提示词",
	transparentBackground: "透明背景",
	smea: "SMEA",
	smeaDyn: "动态 SMEA",
	variety: "多样性",
	fileNamePrefix: "文件名前缀",
	strength: "重绘幅度",
	noise: "噪声强度"
};
function Library({ tab, call, sessionId }) {
	const [snapshot, setSnapshot] = (0, react.useState)(null), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(false), [message, setMessage] = (0, react.useState)("");
	const [items, setItems] = (0, react.useState)([]), [groups, setGroups] = (0, react.useState)([]), [offset, setOffset] = (0, react.useState)(0), [total, setTotal] = (0, react.useState)(0), [query, setQuery] = (0, react.useState)("");
	const [draft, setDraft] = (0, react.useState)(null), [target, setTarget] = (0, react.useState)("params"), [key, setKey] = (0, react.useState)("steps"), [value, setValue] = (0, react.useState)(""), [dirty, setDirty] = (0, react.useState)(false);
	const [showDetails, setShowDetails] = (0, react.useState)(false), [search, setSearch] = (0, react.useState)(query);
	(0, react.useEffect)(() => {
		const timer = setTimeout(() => setSearch(query), 250);
		return () => clearTimeout(timer);
	}, [query]);
	const read = async () => {
		const data = await call("langbai_read_studio_state");
		setSnapshot((previous) => foldSnapshot(previous, data));
		return data;
	};
	const list = async () => {
		const [styles, categories] = await Promise.all([call("langbai_list_studio_data", {
			collection: "styles",
			offset,
			limit: 20,
			query
		}), call("langbai_list_studio_data", {
			collection: "styleGroups",
			limit: 50
		})]);
		setItems(styles.items ?? []);
		setTotal(styles.total ?? 0);
		setGroups(categories.items ?? []);
	};
	const run = async (fn) => {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			await fn();
		} catch (e) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	};
	(0, react.useEffect)(() => {
		let live = true;
		Promise.all([tab === 0 ? call("langbai_read_studio_state") : null, tab === 1 ? Promise.all([call("langbai_list_studio_data", {
			collection: "styles",
			offset,
			limit: 20,
			query: search
		}), call("langbai_list_studio_data", {
			collection: "styleGroups",
			limit: 50
		})]) : null]).then(([state, data]) => {
			if (!live) return;
			if (state) setSnapshot((previous) => foldSnapshot(previous, state));
			if (data) {
				setItems(data[0].items ?? []);
				setTotal(data[0].total ?? 0);
				setGroups(data[1].items ?? []);
			}
		}).catch((e) => {
			if (live) setError(e.message);
		});
		return () => {
			live = false;
		};
	}, [
		call,
		tab,
		offset,
		search
	]);
	(0, react.useEffect)(() => {
		if (tab !== 0 || dirty || draft || busy) return;
		return startPolling({
			read: () => call("langbai_read_studio_state"),
			publish: (data) => setSnapshot((previous) => foldSnapshot(previous, data)),
			onError: (e) => setError(e.message),
			isVisible: () => document.visibilityState === "visible"
		});
	}, [
		call,
		tab,
		dirty,
		draft,
		busy
	]);
	const current = target === "settings" ? snapshot?.settings : target === "workbench" ? snapshot?.generation : snapshot?.generation?.[target];
	const rules = snapshot?.writableSchema?.[target] ?? {}, rule = rules[key];
	(0, react.useEffect)(() => {
		if (!dirty) setValue(current?.[key] ?? "");
	}, [
		snapshot,
		target,
		key,
		dirty
	]);
	const editStyle = async (style) => run(async () => {
		await read();
		setDraft({
			id: style?.id,
			name: style?.name ?? "",
			prompt: style?.prompt ?? "",
			group: style?.group ?? "Default",
			rating: style?.rating ?? 0
		});
	});
	const saveStyle = () => run(async () => {
		await call("langbai_save_style_preset", {
			sessionId,
			...draft,
			rating: Number(draft.rating),
			expectedRevision: snapshot.revision
		});
		setDraft(null);
		await read();
		await list();
		setMessage("已保存到软件风格库");
	});
	const commit = () => run(async () => {
		const input = rule.type === "number" ? Number(value) : rule.type === "boolean" ? value === true || value === "true" : rule.type === "enum" ? rule.enum.find((v) => String(v) === String(value)) : value;
		await call("langbai_update_studio_config", {
			expectedRevision: snapshot.revision,
			target,
			patch: { [key]: input }
		});
		setDirty(false);
		await read();
		setMessage("软件已应用并保存");
	});
	const field = (label, control) => h("label", { className: "studio-library-field" }, h("span", null, label), control);
	return h("section", {
		className: "studio-library",
		"aria-busy": busy
	}, h("div", { className: "studio-library-toolbar" }, h("span", null, "连接当前软件 · ", snapshot?.capturedAt ? new Date(snapshot.capturedAt).toLocaleTimeString() : tab === 1 ? "风格库" : "正在读取…"), h("button", {
		type: "button",
		disabled: busy || !!draft || dirty,
		onClick: () => run(async () => {
			await read();
			if (tab === 1) await list();
		})
	}, "刷新"), tab === 1 ? h("button", {
		type: "button",
		disabled: busy || !!draft,
		onClick: () => editStyle(null)
	}, "新建风格") : null), error ? h("div", {
		role: "alert",
		className: "studio-library-error"
	}, error, dirty || draft ? h("button", { onClick: () => run(async () => {
		await read();
		setMessage("已重新读取；请检查内容后再次提交");
	}) }, "重新读取版本") : null) : null, message ? h("p", { role: "status" }, message) : null, tab === 0 ? h(react.default.Fragment, null, h("div", { className: "studio-library-grid" }, field("参数类别", h(StudioSelect, {
		label: "参数类别",
		value: target,
		disabled: busy,
		onChange: (v) => {
			setTarget(v);
			setDirty(false);
			setKey(Object.keys(snapshot?.writableSchema?.[v] ?? {})[0] ?? "");
		},
		options: Object.keys(snapshot?.writableSchema ?? {}).map((v) => ({
			value: v,
			label: {
				params: "常规生图",
				workbench: "重绘 / 后期",
				i2iParams: "图生图",
				augmentOptions: "增强",
				settings: "软件设置"
			}[v] ?? v
		}))
	})), field("字段", h(StudioSelect, {
		label: "字段",
		value: key,
		disabled: busy,
		onChange: (v) => {
			setKey(v);
			setDirty(false);
		},
		options: Object.keys(rules).map((v) => ({
			value: v,
			label: FIELD_LABELS[v] ? FIELD_LABELS[v] + " · " + v : v
		}))
	})), field("值", rule?.type === "enum" || rule?.type === "boolean" ? h(StudioSelect, {
		label: "值",
		value: String(value),
		disabled: busy,
		onChange: (v) => {
			setValue(v);
			setDirty(true);
		},
		options: (rule.type === "boolean" ? [true, false] : rule.enum).map((v) => ({
			value: String(v),
			label: rule.type === "boolean" ? v ? "开启" : "关闭" : String(v)
		}))
	}) : h(rule?.type === "string" ? "textarea" : "input", {
		type: rule?.type === "number" ? "number" : void 0,
		value,
		disabled: busy,
		min: rule?.min,
		max: rule?.max,
		step: rule?.step ?? "any",
		onChange: (e) => {
			setValue(e.target.value);
			setDirty(true);
		}
	}))), h("div", { className: "studio-library-toolbar" }, h("button", {
		disabled: busy || !dirty,
		onClick: () => {
			setDirty(false);
			setValue(current?.[key] ?? "");
		}
	}, "取消修改"), h("button", {
		disabled: busy || !dirty || !rule,
		onClick: commit
	}, "应用到软件")), h("p", { className: "studio-library-muted" }, "修改时在软件窗口确认。面板可见时每 5 秒检查更新；编辑或切到其他网页时暂停。"), h("details", { onToggle: (e) => setShowDetails(e.currentTarget.open) }, h("summary", null, "查看完整状态与配置"), showDetails ? h("pre", null, JSON.stringify(snapshot, null, 2)) : null)) : draft ? h("div", { className: "studio-library-form" }, field("名称", h("input", {
		value: draft.name,
		maxLength: 200,
		onChange: (e) => setDraft({
			...draft,
			name: e.target.value
		})
	})), field("风格提示词", h("textarea", {
		value: draft.prompt,
		rows: 6,
		maxLength: 3e4,
		onChange: (e) => setDraft({
			...draft,
			prompt: e.target.value
		})
	})), h("div", { className: "studio-library-grid" }, field("分类", h(StudioSelect, {
		label: "分类",
		value: draft.group,
		onChange: (v) => setDraft({
			...draft,
			group: v
		}),
		options: Array.from(new Set([
			"Default",
			draft.group,
			...groups.map((g) => typeof g === "string" ? g : g.name ?? g.id)
		])).filter(Boolean).map((g) => ({
			value: g,
			label: g
		}))
	})), field("评分（0–5）", h("input", {
		type: "number",
		min: 0,
		max: 5,
		step: "any",
		value: draft.rating,
		onChange: (e) => setDraft({
			...draft,
			rating: e.target.value
		})
	}))), h("p", { className: "studio-library-muted" }, "编辑会保留现有预览图；预览图管理继续使用软件风格管理页。"), h("div", { className: "studio-library-toolbar" }, h("button", {
		disabled: busy,
		onClick: () => setDraft(null)
	}, "取消"), h("button", {
		disabled: busy || !draft.name.trim() || !draft.prompt.trim() || !Number.isFinite(Number(draft.rating)) || Number(draft.rating) < 0 || Number(draft.rating) > 5,
		onClick: saveStyle
	}, "保存到软件"))) : h(react.default.Fragment, null, field("搜索风格", h("input", {
		value: query,
		onChange: (e) => {
			setQuery(e.target.value);
			setOffset(0);
		},
		placeholder: "名称或提示词"
	})), items.length === 0 ? h("p", null, "暂无风格，可新建或在软件中添加。") : h("div", { className: "studio-library-list" }, ...items.map((style) => h(StyleCard, {
		key: style.id,
		style,
		call,
		sessionId,
		onEdit: () => editStyle(style)
	}))), h("div", { className: "studio-library-toolbar" }, h("button", {
		disabled: busy || offset === 0,
		onClick: () => setOffset(Math.max(0, offset - 20))
	}, "上一页"), h("span", null, `${total} 个风格`), h("button", {
		disabled: busy || offset + 20 >= total,
		onClick: () => setOffset(offset + 20)
	}, "下一页"))));
}
const CSS = `.studio-local-data .studio-library-list article{flex-wrap:wrap}.studio-local-data .studio-library-list article>div{flex:1 1 180px}.studio-local-data .studio-material-apply{min-height:44px;flex:none}.studio-style-thumb{flex:none;width:104px;height:104px;display:grid;place-items:center;overflow:hidden}.studio-style-thumb img{width:100%;height:100%;object-fit:cover}.studio-image-lightbox{position:fixed;inset:0;background:#000c;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px}.studio-image-lightbox>img{max-width:94vw;max-height:78dvh;object-fit:contain}.studio-preview-actions{display:flex;gap:8px}.studio-session-controls{border-bottom:1px solid var(--dsw-alias-border-l2)}@media(max-width:480px){.studio-library-list .studio-style-card{align-items:start;flex-wrap:wrap}.studio-style-thumb{width:80px;height:80px}.studio-library-list .studio-style-card>div{flex-basis:180px}}[data-conversation-header-corner]{margin-right:104px}.studio-extension-anchor{pointer-events:auto;position:fixed;top:12px;right:18px;z-index:30}.studio-extension-trigger{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer}.studio-extension-menu{position:absolute;right:0;top:44px;width:240px;max-height:calc(100dvh - 80px);overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);padding:8px;box-shadow:0 8px 24px #0002;z-index:2}.studio-extension-menu[hidden]{display:none}.studio-extension-heading{padding:8px 12px;color:var(--dsw-alias-label-secondary);font-size:12px}.studio-extension-menu nav{display:flex;flex-direction:column;gap:2px}.studio-extension-menu nav button,.studio-library-nav button{width:100%;min-height:36px;padding:8px 12px;box-sizing:border-box}.studio-extension-dismiss{position:fixed;inset:0;border:0;background:transparent;z-index:1;cursor:default}.studio-extension-trigger{position:relative;z-index:3}.studio-library .studio-select-trigger{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;min-width:0;min-height:40px;text-align:left;border-radius:6px;background:var(--dsw-alias-bg-base)}.studio-select-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.studio-select-menu{max-height:min(320px,60dvh);max-width:calc(100vw - 24px);overflow-y:auto;overscroll-behavior:contain}.studio-library-modal{max-height:calc(100dvh - 32px)}body:has(.studio-library-modal) ._mask_w1urq_14{backdrop-filter:none!important}.studio-library input,.studio-library textarea{border-radius:6px}.studio-library button{border-radius:6px}@media(max-width:600px){.studio-extension-anchor{top:8px;right:12px}.studio-extension-menu{max-width:calc(100vw - 32px)}}.studio-library-nav{display:flex;flex-direction:column;gap:2px}.studio-library-nav button{display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;padding:8px 12px;border-radius:6px;cursor:pointer;text-align:left}.studio-library-nav button:hover{background:var(--dsw-alias-interactive-bg-hover)}.studio-library-modal{width:min(920px,94vw)!important;max-height:90dvh}.studio-library{color:var(--dsw-alias-label-primary);font:inherit;max-height:72dvh;overflow:auto;padding:16px;box-sizing:border-box}.studio-library-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}.studio-library-toolbar>span:first-child{flex:1}.studio-library-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}.studio-library-field{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}.studio-library input,.studio-library select,.studio-library textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 11px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:inherit}.studio-library button{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;padding:7px 12px;cursor:pointer}.studio-library button:disabled{opacity:.45;cursor:default}.studio-library button:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}.studio-library-error{border:1px solid #c65e5e;border-radius:8px;padding:12px;margin-bottom:12px}.studio-library-error button{margin-left:10px}.studio-library-muted,.studio-library small{color:var(--dsw-alias-label-secondary);font-size:12px}.studio-library-list article{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.studio-library-list article>div{flex:1;min-width:0}.studio-library-list small{display:block;margin-top:6px}.studio-library-list p{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.studio-library pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.studio-library :focus-visible,.studio-library-nav :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}@media(max-width:600px){.studio-library{padding:10px}.studio-library-grid{grid-template-columns:1fr}}
.studio-parameter-tabs{display:flex;gap:6px;overflow-x:auto;margin:12px 0;padding-bottom:4px}.studio-parameter-tabs button{flex:none;white-space:nowrap;min-height:44px}.studio-parameter-tabs button[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}.studio-parameter-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:12px}.studio-parameter-card{min-width:0;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;display:flex;flex-direction:column;gap:8px}.studio-parameter-card code{font-size:11px;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}.studio-parameter-card .studio-library-toolbar{margin:0;gap:8px}.studio-parameter-value{white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;overflow:auto;min-height:24px}.studio-parameter-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:auto}.studio-parameter-actions button{min-height:44px}.studio-parameters .studio-library-toolbar small{display:block}.studio-parameters input{min-height:44px}@media(max-width:600px){.studio-parameter-fields{grid-template-columns:minmax(0,1fr)}}
.studio-session-controls h3{margin:0 0 8px}.studio-session-controls p{margin:8px 0}.studio-session-controls .studio-library-toolbar{margin-bottom:8px}
`;
//#endregion
exports.apply = apply;
exports.inject = inject;

return module.exports;}});
