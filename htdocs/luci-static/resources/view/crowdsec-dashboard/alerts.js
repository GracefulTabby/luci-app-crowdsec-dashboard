'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require crowdsec-dashboard/api as api';

/**
 * CrowdSec Dashboard - Alerts View
 * Historical view of all security alerts
 * Copyright (C) 2024 CyberMind.fr - Gandalf
 */

return view.extend({
	title: _('Alerts'),
	
	csApi: null,
	alerts: [],
	filteredAlerts: [],
	searchQuery: '',
	limit: 100,

	load: function() {
		var cssLink = document.createElement('link');
		cssLink.rel = 'stylesheet';
		cssLink.href = L.resource('crowdsec-dashboard/dashboard.css');
		document.head.appendChild(cssLink);
		
		this.csApi = api;
		return this.csApi.getAlerts(this.limit);
	},

	filterAlerts: function() {
		var query = this.searchQuery.toLowerCase();
		
		this.filteredAlerts = this.alerts.filter(function(a) {
			if (!query) return true;
			
			var searchFields = [
				a.source?.ip,
				a.scenario,
				a.source?.country,
				a.message
			].filter(Boolean).join(' ').toLowerCase();
			
			return searchFields.indexOf(query) !== -1;
		});
	},

	handleSearch: function(ev) {
		this.searchQuery = ev.target.value;
		this.filterAlerts();
		this.updateTable();
	},

	handleLoadMore: function(ev) {
		var self = this;
		this.limit += 100;
		
		this.csApi.getAlerts(this.limit).then(function(data) {
			self.alerts = Array.isArray(data) ? data : [];
			self.filterAlerts();
			self.updateTable();
		});
	},

	handleBanFromAlert: function(ip, scenario, ev) {
		var self = this;
		var duration = '4h';
		var reason = 'Manual ban from alert: ' + scenario;

		if (!self.csApi.isValidIP(ip)) {
			self.showToast(_('Invalid source IP address'), 'error');
			return;
		}

		if (!confirm(_('Ban IP') + ' ' + ip + ' ' + _('for') + ' ' + duration + '?')) {
			return;
		}

		this.csApi.banIP(ip, duration, reason).then(function(result) {
			if (result.success) {
				self.showToast(_('IP') + ' ' + ip + ' ' + _('banned successfully'), 'success');
			} else {
				self.showToast(_('Failed to ban') + ': ' + (result.error || _('Unknown error')), 'error');
			}
		}).catch(function(err) {
			self.showToast(_('Error') + ': ' + err.message, 'error');
		});
	},

	showToast: function(message, type) {
		var existing = document.querySelector('.cs-toast');
		if (existing) existing.remove();
		
		var toast = E('div', { 'class': 'cs-toast ' + (type || '') }, message);
		document.body.appendChild(toast);
		
		setTimeout(function() { toast.remove(); }, 4000);
	},

	updateTable: function() {
		var container = document.getElementById('alerts-table-container');
		if (container) {
			dom.content(container, this.renderTable());
		}

		var statsEl = document.getElementById('alerts-stats');
		if (statsEl) {
			dom.content(statsEl, this.renderStats());
		}

		var countEl = document.getElementById('alerts-count');
		if (countEl) {
			countEl.textContent = this.filteredAlerts.length + ' / ' + this.alerts.length;
		}
	},

	renderAlertDetails: function(alert) {
		var details = [];
		
		if (alert.events_count) {
			details.push(alert.events_count + ' events');
		}
		
		if (alert.source?.as_name) {
			details.push('AS: ' + alert.source.as_name);
		}
		
		if (alert.capacity) {
			details.push('Capacity: ' + alert.capacity);
		}
		
		return details.join(' | ');
	},

	renderTable: function() {
		var self = this;
		
		if (this.filteredAlerts.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, this.searchQuery ? '🔍' : '📭'),
				E('p', {}, this.searchQuery ? _('No matching alerts found') : _('No alerts recorded'))
			]);
		}
		
		var rows = this.filteredAlerts.map(function(a, i) {
			var sourceIp = a.source?.ip || 'N/A';
			var hasDecisions = a.decisions && a.decisions.length > 0;
			
			return E('tr', {}, [
				E('td', {}, E('span', { 'class': 'cs-time' }, self.csApi.formatRelativeTime(a.created_at))),
				E('td', {}, E('span', { 'class': 'cs-ip' }, sourceIp)),
				E('td', {}, E('span', { 'class': 'cs-scenario' }, self.csApi.parseScenario(a.scenario))),
				E('td', {}, E('span', { 'class': 'cs-country' }, [
					E('span', { 'class': 'cs-country-flag' }, self.csApi.getCountryFlag(a.source?.country)),
					' ',
					a.source?.country || 'N/A'
				])),
				E('td', {}, String(a.events_count || 0)),
				E('td', {}, [
					hasDecisions 
						? E('span', { 'class': 'cs-action ban' }, 'Banned')
						: E('span', { 'style': 'color: var(--cs-text-muted)' }, 'No action')
				]),
				E('td', {}, E('span', { 
					'style': 'font-size: 11px; color: var(--cs-text-muted)',
					'title': self.renderAlertDetails(a)
			}, (function(s) { return s.length > 40 ? s.substring(0, 40) + '...' : s; })(self.renderAlertDetails(a)))),
				E('td', {}, sourceIp !== 'N/A' ? E('button', {
				'class': 'cs-btn cs-btn-sm cs-btn-danger',
				'click': ui.createHandlerFn(self, 'handleBanFromAlert', sourceIp, a.scenario)
			}, _('Ban')) : '—')
		]);
		});

		return E('div', { 'class': 'cs-table-wrap' }, [
			E('table', { 'class': 'cs-table' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, _('Time')),
					E('th', {}, _('Source IP')),
					E('th', {}, _('Scenario')),
					E('th', {}, _('Country')),
					E('th', {}, _('Events')),
					E('th', {}, _('Decision')),
					E('th', {}, _('Details')),
					E('th', {}, _('Actions'))
				])),
				E('tbody', {}, rows)
			]),
			this.alerts.length >= this.limit ? E('div', {
				'style': 'text-align: center; padding: 20px'
			}, [
				E('button', {
					'class': 'cs-btn',
					'click': ui.createHandlerFn(this, 'handleLoadMore')
				}, _('Load More Alerts'))
		]);
	},

	renderStats: function() {
		var self = this;

		var scenarioCounts = {};
		var countryCounts  = {};
		var last24h = 0;
		var now = new Date();

		this.alerts.forEach(function(a) {
			var scenario = self.csApi.parseScenario(a.scenario);
			scenarioCounts[scenario] = (scenarioCounts[scenario] || 0) + 1;

			var country = (a.source && a.source.country) ? a.source.country : 'Unknown';
			countryCounts[country] = (countryCounts[country] || 0) + 1;

			var created = new Date(a.created_at);
			if ((now - created) < 86400000) last24h++;
		});

		var topScenarios = Object.keys(scenarioCounts)
			.map(function(k) { return [k, scenarioCounts[k]]; })
			.sort(function(a, b) { return b[1] - a[1]; })
			.slice(0, 5);

		var maxCount = topScenarios.length > 0 ? topScenarios[0][1] : 0;

		var scenarioBars = topScenarios.map(function(s) {
			var pct = maxCount > 0 ? (s[1] / maxCount * 100) : 0;
			return E('div', { 'class': 'cs-bar-item' }, [
				E('div', { 'class': 'cs-bar-label', 'title': s[0] }, s[0]),
				E('div', { 'class': 'cs-bar-track' }, [
					E('div', { 'class': 'cs-bar-fill purple', 'style': 'width: ' + pct + '%' })
				]),
				E('div', { 'class': 'cs-bar-value' }, String(s[1]))
			]);
		});

		return [
			E('div', { 'class': 'cs-stat-card', 'data-accent': 'orange' }, [
				E('span', { 'class': 'cs-stat-card-icon' }, '🚨'),
				E('div', { 'class': 'cs-stat-label' }, _('Total Alerts')),
				E('div', { 'class': 'cs-stat-value' }, String(this.alerts.length)),
				E('div', { 'class': 'cs-stat-description' }, last24h + ' ' + _('in last 24h'))
			]),
			E('div', { 'class': 'cs-stat-card', 'data-accent': 'purple' }, [
				E('span', { 'class': 'cs-stat-card-icon' }, '🔬'),
				E('div', { 'class': 'cs-stat-label' }, _('Unique Scenarios')),
				E('div', { 'class': 'cs-stat-value' }, String(Object.keys(scenarioCounts).length)),
				E('div', { 'class': 'cs-stat-description' }, _('Attack patterns detected'))
			]),
			E('div', { 'class': 'cs-stat-card', 'data-accent': 'blue' }, [
				E('span', { 'class': 'cs-stat-card-icon' }, '🌍'),
				E('div', { 'class': 'cs-stat-label' }, _('Countries')),
				E('div', { 'class': 'cs-stat-value' }, String(Object.keys(countryCounts).length)),
				E('div', { 'class': 'cs-stat-description' }, _('Unique attacker origins'))
			]),
			E('div', { 'class': 'cs-card', 'style': 'overflow: visible' }, [
				E('div', { 'class': 'cs-card-header' }, [
					E('div', { 'class': 'cs-card-title' }, '🔍 ' + _('Top Attack Scenarios'))
				]),
				E('div', { 'class': 'cs-card-body' }, [
					scenarioBars.length > 0
						? E('div', { 'class': 'cs-bar-chart' }, scenarioBars)
						: E('div', { 'class': 'cs-empty' }, [ E('p', {}, _('No data yet')) ])
				])
			])
		];
	},

	render: function(data) {
		var self = this;
		this.alerts = Array.isArray(data) ? data : [];
		this.filterAlerts();

		var view = E('div', { 'class': 'crowdsec-dashboard' }, [
			// KPI + top-scenario row
			E('div', { 'class': 'cs-stats-grid', 'id': 'alerts-stats' }, this.renderStats()),

			// Main table card
			E('div', { 'class': 'cs-card' }, [
				E('div', { 'class': 'cs-card-header' }, [
					E('div', { 'class': 'cs-card-title' }, [
						'📄 ' + _('Alert History'),
						E('span', {
							'class': 'cs-section-badge',
							'id': 'alerts-count'
						}, this.filteredAlerts.length + ' / ' + this.alerts.length)
					]),
					E('div', { 'class': 'cs-actions-bar' }, [
						E('div', { 'class': 'cs-search-box' }, [
							E('input', {
								'class': 'cs-input',
								'type': 'text',
								'placeholder': _('Search IP, scenario, country...'),
								'input': ui.createHandlerFn(this, 'handleSearch')
							})
						])
					])
				]),
				E('div', { 'class': 'cs-card-body no-padding', 'id': 'alerts-table-container' },
					this.renderTable()
				)
			])
		]);

		poll.add(function() {
			return self.csApi.getAlerts(self.limit).then(function(newData) {
				self.alerts = Array.isArray(newData) ? newData : [];
				self.filterAlerts();
				self.updateTable();
			});
		}, 60);

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
