window.__ModuleLoader__.load({
	id: "dsh-client-ui-auto-approval",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/locales.js
		/**
		* `auto-approval` locale namespace dictionaries for the status chip.
		*
		* The framework injects a `t` seat into the chip's props when its slot
		* registration declares `locale: 'auto-approval'` (see `./index.ts`), and the
		* browser follows the DSH locale preference — no plugin-side language switch.
		* `zh` is the key-set source of truth; `en` is checked complete against it.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"chip.label": "AA",
			"chip.on": "AA 开",
			"chip.off": "AA 关",
			"chip.title": "自动审批",
			"chip.loading": "自动审批：加载中…",
			"chip.error": "自动审批：{message}",
			"chip.counts": "✓ 已放行 {approved} 次 · ✗ 已拦截 {denied} 次",
			"dialog.title": "自动审批",
			"dialog.close": "关闭",
			"dialog.loading": "正在读取自动审批状态…",
			"dialog.unavailable": "状态不可用：{message}",
			"status.enabled": "已启用",
			"status.disabled": "已停用",
			"toggle.on.desc": "安全调用自动放行，危险调用直接拦截。",
			"toggle.off.desc": "所有调用都走正常审批流程。",
			"toggle.on.aria": "关闭自动审批",
			"toggle.off.aria": "开启自动审批",
			"config.safetyRules": "安全规则",
			"config.reviewModel": "审查模型",
			"config.trustedTools": "免检工具",
			"config.off": "未启用",
			"stat.approved": "已放行",
			"stat.denied": "已拦截",
			"history.title": "最近决策",
			"history.count": "显示 {count} 条 · 最新在前",
			"history.empty": "本会话还没有自动审批决策记录。",
			"table.time": "时间",
			"table.tool": "工具",
			"table.stage": "阶段",
			"table.verdict": "判定",
			"table.detail": "详情",
			"verdict.allow": "允许",
			"verdict.deny": "拒绝"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"chip.label": "AA",
			"chip.on": "AA on",
			"chip.off": "AA off",
			"chip.title": "auto-approval",
			"chip.loading": "auto-approval: loading…",
			"chip.error": "auto-approval: {message}",
			"chip.counts": "✓ {approved} approved · ✗ {denied} denied",
			"dialog.title": "Auto-approval",
			"dialog.close": "Close",
			"dialog.loading": "Loading auto-approval status…",
			"dialog.unavailable": "Status unavailable: {message}",
			"status.enabled": "Enabled",
			"status.disabled": "Disabled",
			"toggle.on.desc": "Safe calls run automatically; dangerous ones are blocked.",
			"toggle.off.desc": "All calls go through the normal approval flow.",
			"toggle.on.aria": "Turn off auto-approval",
			"toggle.off.aria": "Turn on auto-approval",
			"config.safetyRules": "Safety rules",
			"config.reviewModel": "Review model",
			"config.trustedTools": "Trusted tools",
			"config.off": "off",
			"stat.approved": "Approved",
			"stat.denied": "Denied",
			"history.title": "Recent decisions",
			"history.count": "{count} shown · newest first",
			"history.empty": "No auto-approval decisions recorded for this session yet.",
			"table.time": "Time",
			"table.tool": "Tool",
			"table.stage": "Stage",
			"table.verdict": "Verdict",
			"table.detail": "Detail",
			"verdict.allow": "allow",
			"verdict.deny": "deny"
		};
		//#endregion
		//#region lib/types/client/AutoApprovalChip.js
		/**
		* Composer status chip for the auto-approval runtime. Reads the host state via
		* the injected `getStatus` remote call and renders an official Pill: a
		* token-colored state dot plus a short state word, with cumulative stats in
		* the hover Tooltip.
		*
		* Clicking the chip opens the official Modal showing:
		* - the on/off toggle (drives the host `setEnabled` remote, persisted via
		*   settings when available);
		* - cumulative counts (approved / denied);
		* - the recent decisions table (time, tool, stage, verdict, matched
		*   pattern / rationale).
		*
		* Theming: every color resolves through `--dsw-alias-*` semantic tokens
		* (`--dsw-static-*` only where no alias exists), which `ui-theme` redefines
		* under `body[data-ds-dark-theme]` — dark/light switching is automatic.
		* Official components (Pill / Tooltip / Modal) ride the platform
		* module table, so no CSS-module pipeline is needed here; locally composed
		* parts (stat tiles, table, dot) use inline styles over the same tokens.
		*/
		/** Poll cadence while the chip stays mounted (no event forwarding for third-party remotes). */
		const POLL_MS = 2e3;
		const SUCCESS = "var(--dsw-alias-state-success-primary)";
		const ERROR = "var(--dsw-alias-state-error-primary)";
		const LABEL_PRIMARY = "var(--dsw-alias-label-primary)";
		const LABEL_SECONDARY = "var(--dsw-alias-label-secondary)";
		const LABEL_CAPTION = "var(--dsw-alias-label-caption)";
		const BORDER_L1 = "var(--dsw-alias-border-l1)";
		const BORDER_L2 = "var(--dsw-alias-border-l2)";
		const BG_LAYER_2 = "var(--dsw-alias-bg-layer-2)";
		const BG_LAYER_3 = "var(--dsw-alias-bg-layer-3)";
		const MONO_FONT = "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)";
		/**
		* Width/space overrides for the official Modal: the figma dialog is
		* min(380px, 100%) wide (cramps the toggle row and truncates the decision
		* table) and the official body carries a 20px top margin (extra whitespace
		* under the title). We keep every official behavior (mask, blur, Escape,
		* portal, aria) and only adjust chrome via classes injected below — no
		* !important on layout-critical properties beyond these two overrides.
		*/
		const DIALOG_WIDTH_CSS = `
.aa-modal-wide { width: min(660px, 100%) !important; }
.aa-modal-flush > *:last-child { margin-top: 0 !important; }
`;
		/** Cumulative counts as a compact "✓ n · ✗ n" line for the tooltip. */
		function countLine(status, t) {
			return t("chip.counts", {
				approved: status.approvals,
				denied: status.totalDenials
			});
		}
		/** From "provider/model" take the model segment (keeps the tooltip short). */
		function shortModel(classifier) {
			const slash = classifier.lastIndexOf("/");
			return slash >= 0 ? classifier.slice(slash + 1) : classifier;
		}
		/** One-line tooltip: cumulative counts only (full config lives in the dialog). */
		function describe(status, t) {
			return countLine(status, t);
		}
		const CELL = {
			padding: "8px 10px",
			fontSize: 12,
			lineHeight: "18px",
			textAlign: "left",
			verticalAlign: "top"
		};
		const HEADER_CELL = {
			...CELL,
			fontWeight: 600,
			color: LABEL_SECONDARY,
			borderBottom: `1px solid ${BORDER_L2}`,
			position: "sticky",
			top: 0,
			background: BG_LAYER_2
		};
		/** Verdict label: colored by the official state-token pair (allow/deny only). */
		function VerdictBadge({ decision, t }) {
			return (0, react_jsx_runtime.jsx)("span", {
				style: {
					color: decision === "allow" ? SUCCESS : ERROR,
					fontWeight: 600,
					whiteSpace: "nowrap"
				},
				children: t(decision === "allow" ? "verdict.allow" : "verdict.deny")
			});
		}
		function DecisionRow({ record, t }) {
			const detail = record.pattern !== void 0 ? `pattern /${record.pattern}/` : record.detail ?? "";
			const time = new Date(record.time);
			const timeText = Number.isNaN(time.getTime()) ? record.time : time.toLocaleTimeString(void 0, {
				hour12: false,
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit"
			});
			return (0, react_jsx_runtime.jsxs)("tr", {
				style: { borderTop: `1px solid ${BORDER_L1}` },
				children: [
					(0, react_jsx_runtime.jsx)("td", {
						style: {
							...CELL,
							whiteSpace: "nowrap",
							color: LABEL_CAPTION,
							fontFamily: MONO_FONT
						},
						children: timeText
					}),
					(0, react_jsx_runtime.jsx)("td", {
						style: {
							...CELL,
							whiteSpace: "nowrap",
							color: LABEL_PRIMARY,
							fontFamily: MONO_FONT
						},
						children: record.tool
					}),
					(0, react_jsx_runtime.jsx)("td", {
						style: {
							...CELL,
							maxWidth: 130,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							color: LABEL_SECONDARY
						},
						title: record.stage,
						children: record.stage
					}),
					(0, react_jsx_runtime.jsx)("td", {
						style: CELL,
						children: (0, react_jsx_runtime.jsx)(VerdictBadge, {
							decision: record.decision,
							t
						})
					}),
					(0, react_jsx_runtime.jsx)("td", {
						style: {
							...CELL,
							maxWidth: 220,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							color: LABEL_SECONDARY
						},
						title: detail,
						children: detail
					})
				]
			});
		}
		/** Stat tile: raised surface (layer-3) on the layer-2 dialog card. */
		function StatTile({ label, value, color }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					flex: 1,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 2,
					padding: "10px 8px",
					borderRadius: 12,
					border: `1px solid ${BORDER_L1}`,
					background: BG_LAYER_3
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: 20,
						lineHeight: "24px",
						fontWeight: 600,
						color
					},
					children: value
				}), (0, react_jsx_runtime.jsx)("span", {
					style: {
						fontSize: 11,
						lineHeight: "16px",
						color: LABEL_CAPTION
					},
					children: label
				})]
			});
		}
		/** Formatted armed-config rows: plain-language labels, no internal jargon. */
		function ConfigSummary({ status, t }) {
			const rows = [
				[t("config.safetyRules"), `${status.denyPatterns + status.askPatterns}`],
				[t("config.reviewModel"), status.classifier === "disabled" ? t("config.off") : shortModel(status.classifier)],
				[t("config.trustedTools"), `${status.autoApproveTools}`]
			];
			return (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 3,
					marginTop: 12
				},
				children: rows.map(([label, value]) => (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						gap: 10,
						fontSize: 12,
						lineHeight: "18px"
					},
					children: [(0, react_jsx_runtime.jsx)("span", {
						style: {
							width: 92,
							flexShrink: 0,
							color: LABEL_CAPTION
						},
						children: label
					}), (0, react_jsx_runtime.jsx)("span", {
						style: { color: LABEL_SECONDARY },
						children: value
					})]
				}, label))
			});
		}
		/** Minimal switch (track + thumb), styled with the official alias tokens. */
		function Switch({ checked, disabled, onChange, label }) {
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				disabled,
				onClick: onChange,
				style: {
					position: "relative",
					width: 40,
					height: 22,
					flexShrink: 0,
					borderRadius: 11,
					border: "none",
					padding: 0,
					cursor: disabled ? "default" : "pointer",
					background: checked ? SUCCESS : BORDER_L2,
					opacity: disabled ? .6 : 1,
					transition: "background 150ms"
				},
				children: (0, react_jsx_runtime.jsx)("span", { style: {
					position: "absolute",
					top: 3,
					left: checked ? 21 : 3,
					width: 16,
					height: 16,
					borderRadius: "50%",
					background: "var(--dsw-alias-label-primary)",
					transition: "left 150ms"
				} })
			});
		}
		/** Status tag in the official plugin-list configTag style. */
		function StatusTag({ enabled, t }) {
			return (0, react_jsx_runtime.jsx)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					minHeight: 20,
					borderRadius: 5,
					padding: "1px 6px",
					background: enabled ? "color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)" : "var(--dsw-alias-bg-layer-1)",
					color: enabled ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-secondary)",
					fontSize: 11,
					lineHeight: "16px",
					whiteSpace: "nowrap"
				},
				children: enabled ? t("status.enabled") : t("status.disabled")
			});
		}
		function DialogContent({ status, history, toggling, error, onToggle, t }) {
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 12
					},
					children: [(0, react_jsx_runtime.jsxs)("div", {
						style: { minWidth: 0 },
						children: [(0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8
							},
							children: (0, react_jsx_runtime.jsx)(StatusTag, {
								enabled: status.enabled,
								t
							})
						}), (0, react_jsx_runtime.jsx)("div", {
							style: {
								fontSize: 12,
								lineHeight: "18px",
								color: LABEL_SECONDARY,
								marginTop: 6
							},
							children: status.enabled ? t("toggle.on.desc") : t("toggle.off.desc")
						})]
					}), (0, react_jsx_runtime.jsx)(Switch, {
						checked: status.enabled,
						disabled: toggling,
						onChange: onToggle,
						label: status.enabled ? t("toggle.on.aria") : t("toggle.off.aria")
					})]
				}),
				(0, react_jsx_runtime.jsx)(ConfigSummary, {
					status,
					t
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						gap: 8,
						marginTop: 16
					},
					children: [(0, react_jsx_runtime.jsx)(StatTile, {
						label: t("stat.approved"),
						value: status.approvals,
						color: SUCCESS
					}), (0, react_jsx_runtime.jsx)(StatTile, {
						label: t("stat.denied"),
						value: status.totalDenials,
						color: ERROR
					})]
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					style: {
						marginTop: 16,
						fontSize: 13,
						lineHeight: "20px",
						fontWeight: 600,
						color: LABEL_PRIMARY
					},
					children: [t("history.title"), history.length > 0 && (0, react_jsx_runtime.jsx)("span", {
						style: {
							fontSize: 11,
							fontWeight: 400,
							color: LABEL_CAPTION,
							marginLeft: 6
						},
						children: t("history.count", { count: history.length })
					})]
				}),
				history.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
					style: {
						padding: "12px 0",
						fontSize: 12,
						lineHeight: "18px",
						color: LABEL_SECONDARY
					},
					children: t("history.empty")
				}) : (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 6,
						maxHeight: "38vh",
						overflowY: "auto"
					},
					children: (0, react_jsx_runtime.jsxs)("table", {
						style: {
							width: "100%",
							borderCollapse: "collapse"
						},
						children: [(0, react_jsx_runtime.jsx)("thead", { children: (0, react_jsx_runtime.jsxs)("tr", { children: [
							(0, react_jsx_runtime.jsx)("th", {
								style: HEADER_CELL,
								children: t("table.time")
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: HEADER_CELL,
								children: t("table.tool")
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: HEADER_CELL,
								children: t("table.stage")
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: HEADER_CELL,
								children: t("table.verdict")
							}),
							(0, react_jsx_runtime.jsx)("th", {
								style: HEADER_CELL,
								children: t("table.detail")
							})
						] }) }), (0, react_jsx_runtime.jsx)("tbody", { children: history.map((record, index) => (0, react_jsx_runtime.jsx)(DecisionRow, {
							record,
							t
						}, index)) })]
					})
				}),
				error !== void 0 && (0, react_jsx_runtime.jsx)("div", {
					style: {
						marginTop: 10,
						fontSize: 12,
						lineHeight: "18px",
						color: ERROR
					},
					children: error
				})
			] });
		}
		/**
		* The status pill. It owns its polling and is intentionally silent on failure:
		* a failed remote read renders an error-colored "AA" with the error in the
		* tooltip rather than breaking the composer. Clicking opens the dialog
		* (toggle + history).
		*/
		function AutoApprovalChip({ getStatus, getHistory, setEnabled, t }) {
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [dialogOpen, setDialogOpen] = (0, react.useState)(false);
			const [history, setHistory] = (0, react.useState)([]);
			const [toggling, setToggling] = (0, react.useState)(false);
			const [dialogError, setDialogError] = (0, react.useState)(void 0);
			const alive = (0, react.useRef)(true);
			const pollStatus = (0, react.useCallback)(() => {
				getStatus().then((result) => {
					if (!alive.current) return;
					if (result.ok) setState({
						kind: "status",
						status: result.value
					});
					else setState({
						kind: "error",
						message: result.error.message
					});
				}, (reason) => {
					if (!alive.current) return;
					setState({
						kind: "error",
						message: reason instanceof Error ? reason.message : String(reason)
					});
				});
			}, [getStatus]);
			(0, react.useEffect)(() => {
				alive.current = true;
				pollStatus();
				const timer = setInterval(pollStatus, POLL_MS);
				return () => {
					alive.current = false;
					clearInterval(timer);
				};
			}, [pollStatus]);
			(0, react.useEffect)(() => {
				if (!dialogOpen) return;
				let cancelled = false;
				const refresh = () => {
					getHistory().then((result) => {
						if (cancelled) return;
						if (result.ok) setHistory(result.value);
						else setDialogError(result.error.message);
					}, (reason) => {
						if (cancelled) return;
						setDialogError(reason instanceof Error ? reason.message : String(reason));
					});
				};
				refresh();
				const timer = setInterval(refresh, POLL_MS);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [dialogOpen, getHistory]);
			const toggle = (0, react.useCallback)(() => {
				if (toggling) return;
				const current = state.kind === "status" ? state.status.enabled : false;
				setToggling(true);
				setDialogError(void 0);
				setEnabled(!current).then((result) => {
					if (!alive.current) return;
					setToggling(false);
					if (result.ok) setState({
						kind: "status",
						status: result.value
					});
					else setDialogError(result.error.message);
				}, (reason) => {
					if (!alive.current) return;
					setToggling(false);
					setDialogError(reason instanceof Error ? reason.message : String(reason));
				});
			}, [
				state,
				toggling,
				setEnabled
			]);
			let dot = LABEL_CAPTION;
			let label = t("chip.label");
			let title = t("chip.title");
			if (state.kind === "loading") {
				dot = LABEL_CAPTION;
				label = t("chip.label");
				title = t("chip.loading");
			} else if (state.kind === "error") {
				dot = ERROR;
				label = t("chip.label");
				title = t("chip.error", { message: state.message });
			} else if (!state.status.enabled) {
				dot = LABEL_CAPTION;
				label = t("chip.off");
				title = describe(state.status, t);
			} else {
				dot = SUCCESS;
				label = t("chip.on");
				title = describe(state.status, t);
			}
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("style", { children: DIALOG_WIDTH_CSS }),
				(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: title,
					side: "top",
					delayMs: 300,
					children: (0, react_jsx_runtime.jsx)("span", {
						style: { display: "inline-flex" },
						children: (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
							onClick: () => setDialogOpen(true),
							"aria-label": title,
							"aria-haspopup": "dialog",
							children: [(0, react_jsx_runtime.jsx)("span", {
								style: {
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: dot,
									flexShrink: 0
								},
								"aria-hidden": true
							}), label]
						})
					})
				}),
				(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
					open: dialogOpen,
					onClose: () => setDialogOpen(false),
					title: t("dialog.title"),
					closeLabel: t("dialog.close"),
					className: "aa-modal-wide",
					contentClassName: "aa-modal-flush",
					children: state.kind === "status" ? (0, react_jsx_runtime.jsx)(DialogContent, {
						status: state.status,
						history,
						toggling,
						error: dialogError,
						onToggle: toggle,
						t
					}) : (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 12,
							lineHeight: "18px",
							color: LABEL_SECONDARY
						},
						children: state.kind === "loading" ? t("dialog.loading") : t("dialog.unavailable", { message: state.message })
					})
				})
			] });
		}
		//#endregion
		//#region lib/types/client/schema.js
		/** Reject one malformed boundary value with the offending field name. */
		function invalid(what) {
			throw new Error(`auto-approval wire: invalid ${what}`);
		}
		function asRecord(value, what) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(what);
			return value;
		}
		function asString(value, what) {
			if (typeof value !== "string") invalid(what);
			return value;
		}
		function asNumber(value, what) {
			if (typeof value !== "number" || !Number.isFinite(value)) invalid(what);
			return value;
		}
		function asBoolean(value, what) {
			if (typeof value !== "boolean") invalid(what);
			return value;
		}
		/** Strict schema for `autoApprovalStatus.getStatus` / `setEnabled` results. */
		const statusSchema = { parse(value) {
			const row = asRecord(value, "AutoApprovalStatus");
			return Object.freeze({
				enabled: asBoolean(row["enabled"], "AutoApprovalStatus.enabled"),
				denyPatterns: asNumber(row["denyPatterns"], "AutoApprovalStatus.denyPatterns"),
				askPatterns: asNumber(row["askPatterns"], "AutoApprovalStatus.askPatterns"),
				autoApproveTools: asNumber(row["autoApproveTools"], "AutoApprovalStatus.autoApproveTools"),
				classifier: asString(row["classifier"], "AutoApprovalStatus.classifier"),
				denials: asNumber(row["denials"], "AutoApprovalStatus.denials"),
				approvals: asNumber(row["approvals"], "AutoApprovalStatus.approvals"),
				totalDenials: asNumber(row["totalDenials"], "AutoApprovalStatus.totalDenials")
			});
		} };
		/** Strict schema for one decision record. */
		const decisionRecordSchema = { parse(value) {
			const row = asRecord(value, "DecisionRecord");
			const decision = asString(row["decision"], "DecisionRecord.decision");
			if (decision !== "allow" && decision !== "deny") invalid("DecisionRecord.decision");
			return Object.freeze({
				time: asString(row["time"], "DecisionRecord.time"),
				tool: asString(row["tool"], "DecisionRecord.tool"),
				stage: asString(row["stage"], "DecisionRecord.stage"),
				decision,
				...row["pattern"] === void 0 ? {} : { pattern: asString(row["pattern"], "DecisionRecord.pattern") },
				...row["detail"] === void 0 ? {} : { detail: asString(row["detail"], "DecisionRecord.detail") }
			});
		} };
		/** Strict schema for the decision-record array returned by `getHistory`. */
		const decisionListSchema = { parse(value) {
			if (!Array.isArray(value)) invalid("DecisionRecord[]");
			return Object.freeze(value.map((entry) => decisionRecordSchema.parse(entry)));
		} };
		/** Strict schema for the `agent` lookup value (a branded SessionId string). */
		const sessionIdSchema = { parse(value) {
			return asString(value, "agentId");
		} };
		/** Strict schema for the boolean `setEnabled` parameter. */
		const booleanSchema = { parse(value) {
			return asBoolean(value, "enabled");
		} };
		//#endregion
		//#region lib/types/client/remote.js
		/** Agent lookup parameter shared by every remote method. */
		const agentParameter = {
			name: "agent",
			wire: "agentId",
			source: "lookup",
			lookup: "agent",
			codec: {
				mode: "strict",
				typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
				schema: sessionIdSchema
			}
		};
		/**
		* The generated Host-for-Client contribution, mounted by the client half via
		* `ctx.remote.$mount(TYPERT_REMOTE)`.
		*/
		const TYPERT_REMOTE = {
			package: "dsh-auto-approval",
			descriptors: [
				{
					id: "dsh-auto-approval#autoApprovalStatus/getStatus",
					service: "autoApprovalStatus",
					namespace: "autoApprovalStatus",
					method: "getStatus",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [agentParameter],
					result: {
						mode: "strict",
						typeSymbol: "dsh-auto-approval#AutoApprovalStatus",
						schema: statusSchema
					}
				},
				{
					id: "dsh-auto-approval#autoApprovalStatus/getHistory",
					service: "autoApprovalStatus",
					namespace: "autoApprovalStatus",
					method: "getHistory",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [agentParameter],
					result: {
						mode: "strict",
						typeSymbol: "dsh-auto-approval#DecisionRecord[]",
						schema: decisionListSchema
					}
				},
				{
					id: "dsh-auto-approval#autoApprovalStatus/setEnabled",
					service: "autoApprovalStatus",
					namespace: "autoApprovalStatus",
					method: "setEnabled",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [agentParameter, {
						name: "enabled",
						wire: "enabled",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "boolean",
							schema: booleanSchema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-auto-approval#AutoApprovalStatus",
						schema: statusSchema
					}
				}
			]
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Required services: the seat's slot registry, the Client Remote mount, and the locale registry. */
		const inject = [
			"slots",
			"remote",
			"locale"
		];
		/** Locale namespace owning this chip's dictionaries (follows the DSH locale setting). */
		const LOCALE_NS = "auto-approval";
		/**
		* Client plugin body: mount the host remote contribution, then register the
		* status chip into the composer input-left list slot.
		*
		* The namespace service is read through `ctx.get()` (global store) rather than
		* `ctx.remote.autoApprovalStatus` (per-fiber store chain): `$mount` creates the
		* namespace under the gateway's fiber, a sibling of this plugin — the
		* traceable-proxy path cannot see a sibling-provided service, and declaring it
		* in `inject` would deadlock (the namespace only exists once this apply mounts
		* it). `ctx.get` reads the global reflect store and resolves it directly.
		* @param ctx - client root context.
		*/
		async function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "ui-auto-approval: dictionaries");
			await ctx.remote.$mount(TYPERT_REMOTE);
			const statusRemote = ctx.get("remote.autoApprovalStatus");
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "auto-approval-status",
				locale: LOCALE_NS,
				order: 0,
				inject: (sessionId) => ({
					getStatus: () => statusRemote.getStatus(sessionId),
					getHistory: () => statusRemote.getHistory(sessionId),
					setEnabled: (enabled) => statusRemote.setEnabled(sessionId, enabled)
				})
			}, AutoApprovalChip));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
