'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require crowdsec-dashboard/api as api';

/**
 * CrowdSec Dashboard — Overview
 *
 * このビューはCrowdSecセキュリティエンジンの状態を一元管理するメイン画面です。
 * 30秒ごとに自動更新されます。
 *
 * 表示情報:
 *  - エンジン死活監視 (crowdsec / bouncer プロセス状態)
 *  - KPIカード: アクティブ Ban 数、24h アラート数、バウンサー数、Captcha 数
 *  - システムヘルス: バージョン、稼働時間、プロセス状態
 *  - 脅威シナリオ Top 5 (横棒グラフ)
 *  - 攻撃元 国 Top 10 (横棒グラフ)
 *  - アクティブ決定一覧 (Ban/Captcha、Unban 操作付き)
 *  - 最近のアラートタイムライン
 *  - IP 手動 Ban モーダル
 *
 * Copyright (C) 2024 CyberMind.fr - Gandalf
 */
return view.extend({
	title: _('CrowdSec Dashboard'),

	csApi: null,
	data:  null,

	/* ── Load ──────────────────────────────────────────────────────────────── */
	load: function() {
		var link = document.createElement('link');
		link.rel  = 'stylesheet';
		link.href = L.resource('crowdsec-dashboard/dashboard.css');
		document.head.appendChild(link);

		this.csApi = api;
		return this.csApi.getDashboardData();
	},

	/* ── Helpers ────────────────────────────────────────────────────────────── */
	formatUptime: function(seconds) {
		seconds = parseInt(seconds, 10) || 0;
		var d = Math.floor(seconds / 86400);
		var h = Math.floor((seconds % 86400) / 3600);
		var m = Math.floor((seconds % 3600) / 60);
		if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
		if (h > 0) return h + 'h ' + m + 'm';
		return m + 'm';
	},

	parseScenariosRaw: function(raw) {
		try { return JSON.parse(raw || '[]'); } catch(e) { return []; }
	},

	/* ── Header ─────────────────────────────────────────────────────────────── */
	renderHeader: function(status) {
		var engineRunning  = status.crowdsec === 'running';
		var bouncerRunning = status.bouncer  === 'running';

		return E('div', { 'class': 'cs-header' }, [
			E('div', { 'class': 'cs-logo' }, [
				E('div', { 'class': 'cs-logo-icon' }, '🛡️'),
				E('div', {}, [
					E('div', { 'class': 'cs-logo-text' }, ['Crowd', E('span', {}, 'Sec'), ' Dashboard']),
					E('div', { 'class': 'cs-logo-sub' }, 'Security Operations Center')
				])
			]),
			E('div', { 'class': 'cs-header-right' }, [
				E('div', { 'class': 'cs-badge ' + (engineRunning ? 'running' : 'stopped') }, [
					E('span', { 'class': 'cs-badge-dot ' + (engineRunning ? 'running' : 'stopped') }),
					'Engine: ' + (engineRunning ? 'Running' : 'Stopped')
				]),
				E('div', { 'class': 'cs-badge ' + (bouncerRunning ? 'running' : 'stopped') }, [
					E('span', { 'class': 'cs-badge-dot ' + (bouncerRunning ? 'running' : 'stopped') }),
					'Bouncer: ' + (bouncerRunning ? 'Active' : 'Inactive')
				]),
				E('div', { 'class': 'cs-chip' }, [
					'⬡ v' + (status.version || 'N/A')
				]),
				E('div', { 'class': 'cs-chip' }, [
					'⏱ ' + this.formatUptime(status.uptime)
				])
			])
		]);
	},

	/* ── KPI cards ──────────────────────────────────────────────────────────── */
	renderKPIs: function(stats, decisions) {
		var banCount     = 0;
		var captchaCount = 0;
		if (Array.isArray(decisions)) {
			decisions.forEach(function(d) {
				if (d.type === 'ban')     banCount++;
				else if (d.type === 'captcha') captchaCount++;
			});
		}

		var totalActive = (stats.total_decisions || 0);

		var cards = [
			{
				accent: 'red',
				icon: '🚫',
				label: 'Active Bans',
				value: String(banCount || totalActive),
				desc: 'ファイアウォールで現在ブロック中のIP数'
			},
			{
				accent: 'orange',
				icon: '⚠️',
				label: 'Alerts (24h)',
				value: String(stats.alerts_24h || 0),
				desc: '過去24時間に検出された脅威イベント数'
			},
			{
				accent: 'blue',
				icon: '📡',
				label: 'Captcha',
				value: String(captchaCount),
				desc: 'CAPTCHA チャレンジ中のIP数'
			},
			{
				accent: 'green',
				icon: '🔒',
				label: 'Bouncers',
				value: String(stats.bouncers || 0),
				desc: '接続中のバウンサー（リメディエーション）数'
			}
		];

		return E('div', { 'class': 'cs-stats-grid' },
			cards.map(function(c) {
				return E('div', { 'class': 'cs-stat-card', 'data-accent': c.accent }, [
					E('span', { 'class': 'cs-stat-card-icon' }, c.icon),
					E('div', { 'class': 'cs-stat-label' }, c.label),
					E('div', { 'class': 'cs-stat-value' }, c.value),
					E('div', { 'class': 'cs-stat-description' }, c.desc)
				]);
			})
		);
	},

	/* ── System health row ──────────────────────────────────────────────────── */
	renderHealthRow: function(status, stats, decisions) {
		var self = this;
		var totalActive = stats.total_decisions || 0;
		var last24h     = stats.alerts_24h || 0;
		var ratio       = last24h > 0 ? Math.round(totalActive / last24h * 100) : 0;

		var engineOk  = status.crowdsec === 'running';
		var bouncerOk = status.bouncer  === 'running';

		var items = [
			{
				label: 'エンジン状態',
				value: engineOk  ? '✓ Running' : '✗ Stopped',
				sub:   'crowdsec プロセス',
				vclass: engineOk  ? 'color: var(--cs-green)' : 'color: var(--cs-red)'
			},
			{
				label: 'バウンサー状態',
				value: bouncerOk ? '✓ Active'  : '✗ Inactive',
				sub:   'firewall-bouncer',
				vclass: bouncerOk ? 'color: var(--cs-green)' : 'color: var(--cs-orange)'
			},
			{
				label: 'バージョン',
				value: 'v' + (status.version || 'N/A'),
				sub:   'CrowdSec Engine'
			},
			{
				label: '稼働時間',
				value: self.formatUptime(status.uptime),
				sub:   'システム起動からの経過'
			},
			{
				label: '封鎖→アラート比',
				value: ratio + '%',
				sub:   last24h + ' alerts → ' + totalActive + ' bans'
			}
		];

		return E('div', { 'class': 'cs-card' }, [
			E('div', { 'class': 'cs-card-header' }, [
				E('div', { 'class': 'cs-card-title' }, '🖥️ System Health')
			]),
			E('div', { 'class': 'cs-card-body' }, [
				E('div', { 'class': 'cs-health-grid' },
					items.map(function(item) {
						return E('div', { 'class': 'cs-health-item' }, [
							E('div', { 'class': 'cs-health-label' }, item.label),
							E('div', { 'class': 'cs-health-value', 'style': item.vclass || '' }, item.value),
							E('div', { 'class': 'cs-health-sub' }, item.sub)
						]);
					})
				)
			])
		]);
	},

	/* ── Top scenarios bar chart ─────────────────────────────────────────────── */
	renderTopScenarios: function(stats) {
		var scenarios = this.parseScenariosRaw(stats.top_scenarios_raw);

		if (scenarios.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, '📊'),
				E('p', {}, 'シナリオデータなし')
			]);
		}

		var maxCount = Math.max.apply(null, scenarios.map(function(s) { return s.count; }));

		var colors = ['', 'red', 'orange', 'purple', '', 'red'];

		return E('div', { 'class': 'cs-bar-chart' },
			scenarios.map(function(s, idx) {
				var pct   = maxCount > 0 ? (s.count / maxCount * 100) : 0;
				var name  = s.scenario.split('/').pop();
				var color = colors[idx % colors.length];
				return E('div', { 'class': 'cs-bar-item' }, [
					E('div', {
						'class': 'cs-bar-label',
						'title': s.scenario
					}, name),
					E('div', { 'class': 'cs-bar-track' }, [
						E('div', {
							'class': 'cs-bar-fill ' + color,
							'style': 'width:' + pct + '%'
						})
					]),
					E('div', { 'class': 'cs-bar-value' }, String(s.count))
				]);
			})
		);
	},

	/* ── Top countries bar chart ─────────────────────────────────────────────── */
	renderTopCountries: function(stats) {
		var self = this;
		var countries = this.parseScenariosRaw(stats.top_countries_raw);

		if (countries.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, '🌍'),
				E('p', {}, '国別データなし')
			]);
		}

		var maxCount = Math.max.apply(null, countries.map(function(c) { return c.count; }));

		return E('div', { 'class': 'cs-bar-chart' },
			countries.map(function(c) {
				var pct  = maxCount > 0 ? (c.count / maxCount * 100) : 0;
				var flag = self.csApi.getCountryFlag(c.country);
				return E('div', { 'class': 'cs-bar-item' }, [
					E('div', { 'class': 'cs-bar-label' }, flag + ' ' + (c.country || 'N/A')),
					E('div', { 'class': 'cs-bar-track' }, [
						E('div', {
							'class': 'cs-bar-fill orange',
							'style': 'width:' + pct + '%'
						})
					]),
					E('div', { 'class': 'cs-bar-value' }, String(c.count))
				]);
			})
		);
	},

	/* ── Decisions table ─────────────────────────────────────────────────────── */
	renderDecisionsTable: function(decisions) {
		var self = this;

		if (!Array.isArray(decisions) || decisions.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, '✅'),
				E('p', {}, 'アクティブな決定なし — クリーン状態')
			]);
		}

		var rows = decisions.slice(0, 15).map(function(d) {
			var actionType = d.type || 'ban';
			return E('tr', {}, [
				E('td', {}, E('span', { 'class': 'cs-ip' }, d.value || 'N/A')),
				E('td', {}, E('span', { 'class': 'cs-scenario' }, self.csApi.parseScenario(d.scenario))),
				E('td', {}, E('span', { 'class': 'cs-country' }, [
					E('span', { 'class': 'cs-country-flag' }, self.csApi.getCountryFlag(d.country)),
					' ' + (d.country || 'N/A')
				])),
				E('td', {}, E('span', { 'class': 'cs-action ' + actionType }, actionType)),
				E('td', {}, E('span', { 'class': 'cs-time' }, self.csApi.formatDuration(d.duration))),
				E('td', {}, d.origin || 'crowdsec'),
				E('td', {}, E('button', {
					'class': 'cs-btn cs-btn-danger cs-btn-sm',
					'click': ui.createHandlerFn(self, 'handleUnban', d.value)
				}, 'Unban'))
			]);
		});

		return E('div', {}, [
			E('table', { 'class': 'cs-table' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, 'IP アドレス'),
					E('th', {}, 'シナリオ'),
					E('th', {}, '国'),
					E('th', {}, 'アクション'),
					E('th', {}, '有効期限'),
					E('th', {}, '発行元'),
					E('th', {}, '操作')
				])),
				E('tbody', {}, rows)
			]),
			decisions.length > 15
				? E('div', { 'style': 'padding: 10px 16px; font-size: 11.5px; color: var(--cs-text-muted); border-top: 1px solid var(--cs-border-muted)' },
					'+ ' + (decisions.length - 15) + ' 件の決定は「Decisions」タブで確認できます')
				: null
		]);
	},

	/* ── Alert timeline ─────────────────────────────────────────────────────── */
	renderAlertsTimeline: function(alerts) {
		var self = this;

		if (!Array.isArray(alerts) || alerts.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, '📭'),
				E('p', {}, '最近のアラートなし')
			]);
		}

		return E('div', { 'class': 'cs-timeline' },
			alerts.slice(0, 10).map(function(a) {
				var srcIp   = (a.source && a.source.ip) ? a.source.ip : 'N/A';
				var evCount = a.events_count || 0;
				return E('div', { 'class': 'cs-timeline-item alert' }, [
					E('div', { 'class': 'cs-timeline-time' },
						self.csApi.formatRelativeTime(a.created_at)),
					E('div', { 'class': 'cs-timeline-content' }, [
						E('div', { 'style': 'margin-bottom: 4px' }, [
							E('span', { 'class': 'cs-scenario' },
								self.csApi.parseScenario(a.scenario))
						]),
						E('div', { 'style': 'display:flex; gap:8px; align-items:center; flex-wrap:wrap' }, [
							E('span', { 'class': 'cs-ip' }, srcIp),
							E('span', { 'style': 'font-size:11px; color: var(--cs-text-muted)' },
								evCount + ' events'),
							a.source && a.source.country
								? E('span', { 'class': 'cs-country' }, [
									E('span', { 'class': 'cs-country-flag' },
										self.csApi.getCountryFlag(a.source.country)),
									' ' + a.source.country
								])
								: null
						])
					])
				]);
			})
		);
	},

	/* ── Threat intelligence summary ─────────────────────────────────────────── */
	renderThreatSummary: function(stats, decisions) {
		var scenarios = this.parseScenariosRaw(stats.top_scenarios_raw);
		var countries = this.parseScenariosRaw(stats.top_countries_raw);

		var totalDecisions  = stats.total_decisions || 0;
		var alerts24h       = stats.alerts_24h || 0;
		var topScenario     = scenarios.length > 0 ? scenarios[0].scenario.split('/').pop() : 'N/A';
		var topCountry      = countries.length > 0  ? countries[0].country : 'N/A';
		var uniqueCountries = countries.length;

		var items = [
			{ label: '総封鎖数',           value: String(totalDecisions),  color: 'var(--cs-red)' },
			{ label: '24h アラート',        value: String(alerts24h),       color: 'var(--cs-orange)' },
			{ label: '最多攻撃シナリオ',    value: topScenario,             color: 'var(--cs-purple)' },
			{ label: '最多攻撃元国',        value: topCountry,              color: 'var(--cs-blue)' },
			{ label: '攻撃元 国種類数',     value: uniqueCountries + ' か国', color: 'var(--cs-text-primary)' }
		];

		return E('div', { 'class': 'cs-card' }, [
			E('div', { 'class': 'cs-card-header' }, [
				E('div', { 'class': 'cs-card-title' }, '🎯 Threat Intelligence Summary'),
				E('div', { 'style': 'font-size:11px; color: var(--cs-text-muted)' }, '集計ベース: 全期間')
			]),
			E('div', { 'class': 'cs-card-body' }, [
				E('div', { 'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px' },
					items.map(function(item) {
						return E('div', { 'style': 'padding: 12px 14px; background: var(--cs-bg-raised); border: 1px solid var(--cs-border-muted); border-radius: var(--cs-radius)' }, [
							E('div', { 'style': 'font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--cs-text-muted); margin-bottom: 5px' }, item.label),
							E('div', { 'style': 'font-size: 16px; font-weight: 700; color: ' + item.color + '; font-family: var(--cs-font-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis' }, item.value)
						]);
					})
				)
			])
		]);
	},

	/* ── Ban modal ──────────────────────────────────────────────────────────── */
	renderBanModal: function() {
		return E('div', { 'class': 'cs-modal-overlay', 'id': 'ban-modal', 'style': 'display:none' }, [
			E('div', { 'class': 'cs-modal' }, [
				E('div', { 'class': 'cs-modal-header' }, [
					E('div', { 'class': 'cs-modal-title' }, '🚫 IP Ban を追加'),
					E('button', {
						'class': 'cs-modal-close',
						'click': ui.createHandlerFn(this, 'closeBanModal')
					}, '×')
				]),
				E('div', { 'class': 'cs-modal-body' }, [
					E('div', { 'class': 'cs-form-group' }, [
						E('label', { 'class': 'cs-form-label' }, 'IP アドレス / CIDR'),
						E('input', {
							'class': 'cs-input',
							'id': 'ban-ip',
							'type': 'text',
							'placeholder': '192.168.1.100 または 10.0.0.0/24',
							'autocomplete': 'off'
						}),
						E('div', { 'class': 'cs-form-hint' }, 'IPv4 アドレスまたは CIDR 形式で入力')
					]),
					E('div', { 'class': 'cs-form-group' }, [
						E('label', { 'class': 'cs-form-label' }, '封鎖期間'),
						E('input', {
							'class': 'cs-input',
							'id': 'ban-duration',
							'type': 'text',
							'placeholder': '4h',
							'value': '4h'
						}),
						E('div', { 'class': 'cs-form-hint' }, '例: 30m, 4h, 7d, 60s（数字＋s/m/h/d）')
					]),
					E('div', { 'class': 'cs-form-group' }, [
						E('label', { 'class': 'cs-form-label' }, '理由 (任意)'),
						E('input', {
							'class': 'cs-input',
							'id': 'ban-reason',
							'type': 'text',
							'placeholder': 'Manual ban from dashboard'
						})
					])
				]),
				E('div', { 'class': 'cs-modal-footer' }, [
					E('button', {
						'class': 'cs-btn',
						'click': ui.createHandlerFn(this, 'closeBanModal')
					}, 'キャンセル'),
					E('button', {
						'class': 'cs-btn cs-btn-primary',
						'click': ui.createHandlerFn(this, 'submitBan')
					}, '封鎖を実行')
				])
			])
		]);
	},

	/* ── Handlers ───────────────────────────────────────────────────────────── */
	handleUnban: function(ip, ev) {
		var self = this;
		if (!confirm('IP ' + ip + ' の封鎖を解除しますか？')) return;

		this.csApi.unbanIP(ip).then(function(result) {
			if (result && result.success) {
				self.showToast('✓ ' + ip + ' の封鎖を解除しました', 'success');
				return self.csApi.getDashboardData();
			} else {
				self.showToast('✗ 解除失敗: ' + ((result && result.error) || '不明なエラー'), 'error');
				return null;
			}
		}).then(function(data) {
			if (data) { self.data = data; self.updateView(); }
		}).catch(function(err) {
			self.showToast('エラー: ' + err.message, 'error');
		});
	},

	openBanModal:  function() { document.getElementById('ban-modal').style.display = 'flex'; },
	closeBanModal: function() {
		document.getElementById('ban-modal').style.display = 'none';
		document.getElementById('ban-ip').value       = '';
		document.getElementById('ban-duration').value = '4h';
		document.getElementById('ban-reason').value   = '';
	},

	submitBan: function() {
		var self     = this;
		var ip       = document.getElementById('ban-ip').value.trim();
		var duration = document.getElementById('ban-duration').value.trim() || '4h';
		var reason   = document.getElementById('ban-reason').value.trim() || 'Manual ban from dashboard';

		if (!ip) {
			self.showToast('IPアドレスを入力してください', 'error');
			return;
		}
		if (!self.csApi.isValidIP(ip)) {
			self.showToast('無効なIPアドレス形式です', 'error');
			return;
		}
		if (!self.csApi.isValidDuration(duration)) {
			self.showToast('無効な期間形式です（例: 4h, 30m, 7d）', 'error');
			return;
		}

		self.csApi.banIP(ip, duration, reason).then(function(result) {
			if (result && result.success) {
				self.showToast('✓ ' + ip + ' を ' + duration + ' 封鎖しました', 'success');
				self.closeBanModal();
				return self.csApi.getDashboardData();
			} else {
				self.showToast('✗ 封鎖失敗: ' + ((result && result.error) || '不明なエラー'), 'error');
				return null;
			}
		}).then(function(data) {
			if (data) { self.data = data; self.updateView(); }
		}).catch(function(err) {
			self.showToast('エラー: ' + err.message, 'error');
		});
	},

	showToast: function(message, type) {
		var old = document.querySelector('.cs-toast');
		if (old) old.remove();
		var toast = E('div', { 'class': 'cs-toast ' + (type || '') }, message);
		document.body.appendChild(toast);
		setTimeout(function() { toast && toast.remove(); }, 4500);
	},

	/* ── View assembly ──────────────────────────────────────────────────────── */
	renderContent: function(data) {
		var self      = this;
		var status    = data.status    || {};
		var stats     = data.stats     || {};
		var decisions = data.decisions || [];
		var alerts    = data.alerts    || [];

		return E('div', {}, [
			/* Header */
			this.renderHeader(status),

			/* KPI cards */
			this.renderKPIs(stats, decisions),

			/* System Health */
			this.renderHealthRow(status, stats, decisions),

			/* Threat Intelligence */
			this.renderThreatSummary(stats, decisions),

			/* Charts row: scenarios + countries */
			E('div', { 'class': 'cs-grid-2' }, [
				E('div', { 'class': 'cs-card', 'style': 'margin-bottom:0' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, '🎭 Top 攻撃シナリオ'),
						E('div', { 'style': 'font-size:11px; color: var(--cs-text-muted)' },
							'直近 100 アラートより集計')
					]),
					E('div', { 'class': 'cs-card-body' }, this.renderTopScenarios(stats))
				]),
				E('div', { 'class': 'cs-card', 'style': 'margin-bottom:0' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, '🌍 Top 攻撃元国'),
						E('div', { 'style': 'font-size:11px; color: var(--cs-text-muted)' },
							'アクティブ決定より集計')
					]),
					E('div', { 'class': 'cs-card-body' }, this.renderTopCountries(stats))
				])
			]),

			/* Decisions + Alert timeline row */
			E('div', { 'class': 'cs-grid-2' }, [
				E('div', { 'class': 'cs-card', 'style': 'margin-bottom:0' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, [
							'🚫 アクティブ決定',
							decisions.length > 0
								? E('span', { 'class': 'cs-section-badge' }, String(decisions.length))
								: null
						]),
						E('button', {
							'class': 'cs-btn cs-btn-primary cs-btn-sm',
							'click': ui.createHandlerFn(self, 'openBanModal')
						}, '+ Ban 追加')
					]),
					E('div', { 'class': 'cs-card-body no-padding' },
						self.renderDecisionsTable(decisions))
				]),
				E('div', { 'class': 'cs-card', 'style': 'margin-bottom:0' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, [
							'⚡ 最近のアラート',
							alerts.length > 0
								? E('span', { 'class': 'cs-section-badge' }, String(alerts.length))
								: null
						]),
						E('div', { 'style': 'font-size:11px; color: var(--cs-text-muted)' }, '最新 10 件')
					]),
					E('div', { 'class': 'cs-card-body' }, self.renderAlertsTimeline(alerts))
				])
			]),

			/* Ban modal */
			this.renderBanModal()
		]);
	},

	updateView: function() {
		var el = document.getElementById('cs-main-content');
		if (el && this.data) dom.content(el, this.renderContent(this.data));
	},

	render: function(data) {
		var self = this;
		this.data = data;

		var view = E('div', { 'class': 'crowdsec-dashboard' }, [
			E('div', { 'id': 'cs-main-content' }, this.renderContent(data))
		]);

		poll.add(function() {
			return self.csApi.getDashboardData().then(function(newData) {
				self.data = newData;
				self.updateView();
			});
		}, 30);

		return view;
	},

	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null
});
