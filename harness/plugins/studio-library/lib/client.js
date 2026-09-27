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
	return h$1("section", { className: "studio-library" }, h$1("h3", null, "智能混合提示词"), h$1("p", null, "描述或图片 → 语言模型整理 Tag 与英文关系短语 → 可选 Jev 核验 → 按画面主次增减权重 → 混合提示词。"), h$1("p", { className: "studio-library-muted" }, "文字输入适度补全：主动补充适用的服装、视角、景别、光线、姿势、表情和动作细节，保持主体与原场景不变，不擅自增加天气、时间或剧情。图片反推仅依据可见证据，不补不可见细节。Tag 表达元素，英文自然语言补足位置、持物、注视与遮挡关系；约 80/20 为参考，不机械凑比例。固定风格和负面提示词不变。多数词默认权重，明确重点及必要构图补全可适当加强，辅助细节可轻微降权；不自动削弱用户明确要求，也不为凑高低权重而强行调整。Jev 评分不直接等于生图权重，不承诺一次生成完美图片。"), h$1("label", { className: "studio-library-toolbar" }, h$1("input", {
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
		style.textContent = CSS;
		document.head.append(style);
		return () => style.remove();
	});
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
		getMarket: () => ctx.get("market")
	})));
	return dispose;
}
function Navigation({ call, renderSlot, getMarket }) {
	const [tab, setTab] = (0, react.useState)(null), [expanded, setExpanded] = (0, react.useState)(false);
	return h(react.default.Fragment, null, h("div", { className: "studio-extension-anchor" }, h("button", {
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
		"智能提示词"
	].map((title, i) => h("button", {
		key: title,
		type: "button",
		"aria-label": title,
		onClick: () => setTab(i)
	}, title))))), h(_deepseek_ai_dsh_client_ui_primitives.Modal, {
		open: tab !== null,
		onClose: () => setTab(null),
		title: [
			"软件参数",
			"风格管理",
			"记忆中心",
			"插件管理",
			"插件市场",
			"智能提示词"
		][tab] ?? "",
		closeLabel: "关闭软件面板",
		className: "studio-library-modal"
	}, tab === 0 || tab === 1 ? h(Library, {
		key: tab,
		tab,
		call
	}) : tab === 2 ? renderSlot("studio.extensions.page", { close: () => setTab(null) }, { only: "personalization" }) : tab === 3 ? renderSlot("studio.extensions.page", {}, { only: "installed-manager" }) : tab === 4 ? getMarket()?.render?.({ close: () => setTab(null) }) ?? h("p", null, "插件市场已安装时，重启酒馆 Agent 后即可使用。") : tab === 5 ? h(JevSettings, { call }) : null));
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
function Library({ tab, call }) {
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
	})), items.length === 0 ? h("p", null, "暂无风格，可新建或在软件中添加。") : h("div", { className: "studio-library-list" }, ...items.map((style) => h("article", { key: style.id }, h("div", null, h("strong", null, style.name), h("small", null, `${style.group ?? "Default"} · ${style.rating ?? 0}/5`), h("p", null, style.prompt)), h("button", {
		disabled: busy,
		onClick: () => editStyle(style)
	}, "编辑")))), h("div", { className: "studio-library-toolbar" }, h("button", {
		disabled: busy || offset === 0,
		onClick: () => setOffset(Math.max(0, offset - 20))
	}, "上一页"), h("span", null, `${total} 个风格`), h("button", {
		disabled: busy || offset + 20 >= total,
		onClick: () => setOffset(offset + 20)
	}, "下一页"))));
}
const CSS = `[data-conversation-header-corner]{margin-right:104px}.studio-extension-anchor{pointer-events:auto;position:fixed;top:12px;right:18px;z-index:30}.studio-extension-trigger{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer}.studio-extension-menu{position:absolute;right:0;top:44px;width:240px;max-height:calc(100dvh - 80px);overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);padding:8px;box-shadow:0 8px 24px #0002;z-index:2}.studio-extension-menu[hidden]{display:none}.studio-extension-heading{padding:8px 12px;color:var(--dsw-alias-label-secondary);font-size:12px}.studio-extension-menu nav{display:flex;flex-direction:column;gap:2px}.studio-extension-menu nav button,.studio-library-nav button{width:100%;min-height:36px;padding:8px 12px;box-sizing:border-box}.studio-extension-dismiss{position:fixed;inset:0;border:0;background:transparent;z-index:1;cursor:default}.studio-extension-trigger{position:relative;z-index:3}.studio-library .studio-select-trigger{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;min-width:0;min-height:40px;text-align:left;border-radius:6px;background:var(--dsw-alias-bg-base)}.studio-select-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.studio-select-menu{max-height:min(320px,60dvh);max-width:calc(100vw - 24px);overflow-y:auto;overscroll-behavior:contain}.studio-library-modal{max-height:calc(100dvh - 32px)}body:has(.studio-library-modal) ._mask_w1urq_14{backdrop-filter:none!important}.studio-library input,.studio-library textarea{border-radius:6px}.studio-library button{border-radius:6px}@media(max-width:600px){.studio-extension-anchor{top:8px;right:12px}.studio-extension-menu{max-width:calc(100vw - 32px)}}.studio-library-nav{display:flex;flex-direction:column;gap:2px}.studio-library-nav button{display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;padding:8px 12px;border-radius:6px;cursor:pointer;text-align:left}.studio-library-nav button:hover{background:var(--dsw-alias-interactive-bg-hover)}.studio-library-modal{width:min(920px,94vw)!important;max-height:90dvh}.studio-library{color:var(--dsw-alias-label-primary);font:inherit;max-height:72dvh;overflow:auto;padding:16px;box-sizing:border-box}.studio-library-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}.studio-library-toolbar>span:first-child{flex:1}.studio-library-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}.studio-library-field{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}.studio-library input,.studio-library select,.studio-library textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 11px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:inherit}.studio-library button{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;padding:7px 12px;cursor:pointer}.studio-library button:disabled{opacity:.45;cursor:default}.studio-library button:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}.studio-library-error{border:1px solid #c65e5e;border-radius:8px;padding:12px;margin-bottom:12px}.studio-library-error button{margin-left:10px}.studio-library-muted,.studio-library small{color:var(--dsw-alias-label-secondary);font-size:12px}.studio-library-list article{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}.studio-library-list article>div{flex:1;min-width:0}.studio-library-list small{display:block;margin-top:6px}.studio-library-list p{white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.studio-library pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.studio-library :focus-visible,.studio-library-nav :focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}@media(max-width:600px){.studio-library{padding:10px}.studio-library-grid{grid-template-columns:1fr}}`;
//#endregion
exports.apply = apply;
exports.inject = inject;

return module.exports;}});
