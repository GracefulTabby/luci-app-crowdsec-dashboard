'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require crowdsec-dashboard/api as api';

/**
 * CrowdSec Dashboard - Decisions View
 * Detailed view and management of all active decisions
 * Copyright (C) 2024 CyberMind.fr - Gandalf
 */

return view.extend({
	title: _('Decisions'),

	csApi: null,
	decisions: [],
	filteredDecisions: [],
	searchQuery: '',
	sortField: 'value',
	sortOrder: 'asc',

	load: function() {
		var cssLink = document.createElement('link');
		cssLink.rel = 'stylesheet';
		cssLink.href = L.resource('crowdsec-dashboard/dashboard.css');
		document.head.appendChild(cssLink);

		this.csApi = api;
		return this.csApi.getDecisions();
	},

	filterDecisions: function() {
		var self = this;
		var query = this.searchQuery.toLowerCase();
		
		this.filteredDecisions = this.decisions.filter(function(d) {
			if (!query) return true;
			
			var searchFields = [
				d.value,
				d.scenario,
				d.country,
				d.type,
				d.origin
			].filter(Boolean).join(' ').toLowerCase();
			
			return searchFields.indexOf(query) !== -1;
		});
		
		// Sort
		this.filteredDecisions.sort(function(a, b) {
			var aVal = a[self.sortField] || '';
			var bVal = b[self.sortField] || '';
			
			if (self.sortOrder === 'asc') {
				return aVal.localeCompare(bVal);
			} else {
				return bVal.localeCompare(aVal);
			}
		});
	},

	handleSearch: function(ev) {
		this.searchQuery = ev.target.value;
		this.filterDecisions();
		this.updateTable();
	},

	handleSort: function(field, ev) {
		if (this.sortField === field) {
			this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			this.sortField = field;
			this.sortOrder = 'asc';
		}
		this.filterDecisions();
		this.updateTable();
	},

	handleUnban: function(ip, ev) {
		var self = this;

		if (!confirm(_('Remove ban for') + ' ' + ip + '?')) {
			return;
		}

		this.csApi.unbanIP(ip).then(function(result) {
			if (result.success) {
				self.showToast(_('IP') + ' ' + ip + ' ' + _('unbanned successfully'), 'success');
				return self.csApi.getDecisions();
			} else {
				self.showToast(_('Failed to unban') + ': ' + (result.error || _('Unknown error')), 'error');
				return null;
			}
		}).then(function(data) {
			if (data) {
				self.decisions = data;
				self.filterDecisions();
				self.updateView();
			}
		}).catch(function(err) {
			self.showToast(_('Error') + ': ' + err.message, 'error');
		});
	},

	handleBulkUnban: function(ev) {
		var self = this;
		var checkboxes = document.querySelectorAll('.cs-decision-checkbox:checked');

		if (checkboxes.length === 0) {
			self.showToast(_('No decisions selected'), 'error');
			return;
		}

		if (!confirm(_('Remove ban for') + ' ' + checkboxes.length + ' ' + _('IP(s)?'))) {
			return;
		}

		var promises = [];
		checkboxes.forEach(function(cb) {
			promises.push(self.csApi.unbanIP(cb.dataset.ip));
		});

		Promise.all(promises).then(function(results) {
			var success = results.filter(function(r) { return r.success; }).length;
			var failed = results.length - success;

			if (success > 0) {
				self.showToast(
					success + ' ' + _('IP(s) unbanned') + (failed > 0 ? ', ' + failed + ' ' + _('failed') : ''),
					failed > 0 ? 'warning' : 'success'
				);
			} else {
				self.showToast(_('Failed to unban IPs'), 'error');
			}

			return self.csApi.getDecisions();
		}).then(function(data) {
			if (data) {
				self.decisions = data;
				self.filterDecisions();
				self.updateView();
			}
		}).catch(function(err) {
			self.showToast(_('Error') + ': ' + err.message, 'error');
		});
	},

	handleSelectAll: function(ev) {
		var checked = ev.target.checked;
		document.querySelectorAll('.cs-decision-checkbox').forEach(function(cb) {
			cb.checked = checked;
		});
	},

	showToast: function(message, type) {
		var existing = document.querySelector('.cs-toast');
		if (existing) existing.remove();
		
		var toast = E('div', { 'class': 'cs-toast ' + (type || '') }, message);
		document.body.appendChild(toast);
		
		setTimeout(function() { toast.remove(); }, 4000);
	},

	updateView: function() {
		var kpiEl = document.getElementById('decisions-kpi');
		if (kpiEl) dom.content(kpiEl, this.renderKPIs());
		this.updateTable();
	},

	updateTable: function() {
		var container = document.getElementById('decisions-table-container');
		if (container) {
			dom.content(container, this.renderTable());
		}

		var countEl = document.getElementById('decisions-count');
		if (countEl) {
			countEl.textContent = this.filteredDecisions.length + ' / ' + this.decisions.length;
		}
	},

	renderKPIs: function() {
		var bans     = this.decisions.filter(function(d) { return d.type === 'ban'; }).length;
		var captchas = this.decisions.filter(function(d) { return d.type === 'captcha'; }).length;
		var countries = (function(decisions) {
			var seen = {};
			decisions.forEach(function(d) { if (d.country) seen[d.country] = 1; });
			return Object.keys(seen).length;
		})(this.decisions);
		var origins = (function(decisions) {
			var seen = {};
			decisions.forEach(function(d) { if (d.origin) seen[d.origin] = 1; });
			return Object.keys(seen).length;
		})(this.decisions);

		return [
			E('div', { 'class': 'cs-stat-card', 'data-accent': 'red' }, [
				E('span', { 'class': 'cs-stat-card-icon' }, '🚫'),
				E('div', { 'class': 'cs-stat-label' }, _('Total Bans')),
				E('div', { 'class': 'cs-stat-value' }, String(bans)),
				E('div', { 'class': 'cs-stat-description' }, _('IP ranges blocked'))
			]),
			E('div', { 'class': 'cs-stat-card', 'data-accent': 'orange' }, [
				E('span', { 'class': 'cs-stat-card-icon' }, '🤖'),
				E('div', { 'class': 'cs-stat-label' }, _('Captcha')),
				E('div', { 'class': 'cs-stat-value' }, String(captchas)),
				E('div', { 'class': 'cs-stat-description' }, _('Challenges active'))
			]),
			E('div', { 'class': 'cs-stat-card', 'data-accent': 'blue' }, [
				E('span', { 'class': 'cs-stat-card-icon' }, '🌍'),
				E('div', { 'class': 'cs-stat-label' }, _('Countries')),
				E('div', { 'class': 'cs-stat-value' }, String(countries)),
				E('div', { 'class': 'cs-stat-description' }, _('Unique source countries'))
			]),
			E('div', { 'class': 'cs-stat-card', 'data-accent': 'purple' }, [
				E('span', { 'class': 'cs-stat-card-icon' }, '🔗'),
				E('div', { 'class': 'cs-stat-label' }, _('Detection Sources')),
				E('div', { 'class': 'cs-stat-value' }, String(origins)),
				E('div', { 'class': 'cs-stat-description' }, _('Origin types'))
			])
		];
	},

	renderSortIcon: function(field) {
		if (this.sortField !== field) return ' ↕';
		return this.sortOrder === 'asc' ? ' ↑' : ' ↓';
	},

	renderTable: function() {
		var self = this;
		
		if (this.filteredDecisions.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, this.searchQuery ? '🔍' : '✅'),
				E('p', {}, this.searchQuery ? _('No matching decisions found') : _('No active decisions'))
			]);
		}
		
		var rows = this.filteredDecisions.map(function(d, i) {
			return E('tr', {}, [
				E('td', {}, E('input', {
					'type': 'checkbox',
					'class': 'cs-decision-checkbox',
					'data-ip': d.value
				})),
				E('td', {}, E('span', { 'class': 'cs-ip' }, d.value || 'N/A')),
					E('td', {}, E('span', { 'class': 'cs-scenario', 'title': d.scenario }, self.csApi.parseScenario(d.scenario))),
				E('td', {}, E('span', { 'class': 'cs-country' }, [
					E('span', { 'class': 'cs-country-flag' }, self.csApi.getCountryFlag(d.country)),
					' ',
					d.country || '—'
				])),
				E('td', {}, E('span', { 'style': 'font-size: 11px; color: var(--cs-text-secondary)' }, d.origin || 'crowdsec')),
				E('td', {}, E('span', { 'class': 'cs-action ' + (d.type || 'ban') }, d.type || 'ban')),
				E('td', {}, E('span', { 'class': 'cs-time' }, self.csApi.formatDuration(d.duration))),
				E('td', {}, E('span', { 'class': 'cs-time' }, self.csApi.formatRelativeTime(d.created_at))),
				E('td', {}, E('button', {
					'class': 'cs-btn cs-btn-danger cs-btn-sm',
					'click': ui.createHandlerFn(self, 'handleUnban', d.value)
			}, _('Unban')))
		]);
		});

		return E('div', { 'class': 'cs-table-wrap' }, [
			E('table', { 'class': 'cs-table' }, [
				E('thead', {}, E('tr', {}, [
					E('th', { 'style': 'width: 36px' }, E('input', {
						'type': 'checkbox',
						'id': 'select-all',
						'change': ui.createHandlerFn(this, 'handleSelectAll')
					})),
					E('th', {
						'class': 'sortable',
						'click': ui.createHandlerFn(this, 'handleSort', 'value')
					}, _('IP Address') + this.renderSortIcon('value')),
					E('th', {
						'class': 'sortable',
						'click': ui.createHandlerFn(this, 'handleSort', 'scenario')
					}, _('Scenario') + this.renderSortIcon('scenario')),
					E('th', {
						'class': 'sortable',
						'click': ui.createHandlerFn(this, 'handleSort', 'country')
					}, _('Country') + this.renderSortIcon('country')),
					E('th', {}, _('Origin')),
					E('th', {}, _('Action')),
					E('th', {}, _('Expires')),
					E('th', {}, _('Created')),
					E('th', {}, _('Actions'))
				])),
				E('tbody', {}, rows)
			])
	renderBanModal: function() {
		return E('div', { 'class': 'cs-modal-overlay', 'id': 'ban-modal', 'style': 'display: none' }, [
			E('div', { 'class': 'cs-modal' }, [
				E('div', { 'class': 'cs-modal-header' }, [
					E('div', { 'class': 'cs-modal-title' }, _('Add IP Ban')),
					E('button', {
						'class': 'cs-modal-close',
						'click': ui.createHandlerFn(this, 'closeBanModal')
					}, '×')
				]),
				E('div', { 'class': 'cs-modal-body' }, [
					E('div', { 'class': 'cs-form-group' }, [
						E('label', { 'class': 'cs-form-label' }, _('IP Address or CIDR')),
						E('input', {
							'class': 'cs-input',
							'id': 'ban-ip',
							'type': 'text',
							'placeholder': '192.168.1.100 / 10.0.0.0/24'
						}),
						E('div', { 'class': 'cs-form-hint' }, _('IPv4 / IPv6 or CIDR notation'))
					]),
					E('div', { 'class': 'cs-form-group' }, [
						E('label', { 'class': 'cs-form-label' }, _('Duration')),
						E('input', {
							'class': 'cs-input',
							'id': 'ban-duration',
							'type': 'text',
							'placeholder': '4h',
							'value': '4h'
						}),
						E('div', { 'class': 'cs-form-hint' }, _('Examples: 30m, 4h, 7d, 1w'))
					]),
					E('div', { 'class': 'cs-form-group' }, [
						E('label', { 'class': 'cs-form-label' }, _('Reason')),
						E('input', {
							'class': 'cs-input',
							'id': 'ban-reason',
							'type': 'text',
							'placeholder': _('Manual ban from dashboard')
						})
					])
				]),
				E('div', { 'class': 'cs-modal-footer' }, [
					E('button', {
						'class': 'cs-btn',
						'click': ui.createHandlerFn(this, 'closeBanModal')
					}, _('Cancel')),
					E('button', {
						'class': 'cs-btn cs-btn-primary',
						'click': ui.createHandlerFn(this, 'submitBan')
					}, _('Add Ban'))
				])
			])
		]);
	},

	openBanModal: function(ev) {
		document.getElementById('ban-modal').style.display = 'flex';
	},

	closeBanModal: function(ev) {
		document.getElementById('ban-modal').style.display = 'none';
		document.getElementById('ban-ip').value = '';
		document.getElementById('ban-duration').value = '4h';
		document.getElementById('ban-reason').value = '';
	},

	submitBan: function(ev) {
		var self = this;
		var ip = document.getElementById('ban-ip').value.trim();
		var duration = document.getElementById('ban-duration').value.trim() || '4h';
		var reason = document.getElementById('ban-reason').value.trim() || 'Manual ban from dashboard';

		if (!ip) {
			self.showToast(_('Please enter an IP address'), 'error');
			return;
		}

		if (!self.csApi.isValidIP(ip)) {
			self.showToast(_('Invalid IP address format'), 'error');
			return;
		}

		if (!self.csApi.isValidDuration(duration)) {
			self.showToast(_('Invalid duration format (e.g. 4h, 30m, 7d)'), 'error');
			return;
		}

		self.csApi.banIP(ip, duration, reason).then(function(result) {
			if (result.success) {
				self.showToast(_('IP') + ' ' + ip + ' ' + _('banned for') + ' ' + duration, 'success');
				self.closeBanModal();
				return self.csApi.getDecisions();
			} else {
				self.showToast(_('Failed to ban') + ': ' + (result.error || _('Unknown error')), 'error');
				return null;
			}
		}).then(function(data) {
			if (data) {
				self.decisions = data;
				self.filterDecisions();
				self.updateView();
			}
		}).catch(function(err) {
			self.showToast(_('Error') + ': ' + err.message, 'error');
		});
	},

	render: function(data) {
		var self = this;
		this.decisions = Array.isArray(data) ? data : [];
		this.filterDecisions();

		var view = E('div', { 'class': 'crowdsec-dashboard' }, [
			// KPI summary row
			E('div', { 'class': 'cs-stats-grid', 'id': 'decisions-kpi' }, this.renderKPIs()),

			// Main table card
			E('div', { 'class': 'cs-card' }, [
				E('div', { 'class': 'cs-card-header' }, [
					E('div', { 'class': 'cs-card-title' }, [
						'⚔ ' + _('Active Decisions'),
						E('span', {
							'class': 'cs-section-badge',
							'id': 'decisions-count'
						}, this.filteredDecisions.length + ' / ' + this.decisions.length)
					]),
					E('div', { 'class': 'cs-actions-bar' }, [
						E('div', { 'class': 'cs-search-box' }, [
							E('input', {
								'class': 'cs-input',
								'type': 'text',
								'placeholder': _('Search IP, scenario, country...'),
								'input': ui.createHandlerFn(this, 'handleSearch')
							})
						]),
						E('button', {
							'class': 'cs-btn cs-btn-danger',
							'click': ui.createHandlerFn(this, 'handleBulkUnban')
						}, _('Unban Selected')),
						E('button', {
							'class': 'cs-btn cs-btn-primary',
							'click': ui.createHandlerFn(this, 'openBanModal')
						}, '+ ' + _('Add Ban'))
					])
				]),
				E('div', { 'class': 'cs-card-body no-padding', 'id': 'decisions-table-container' },
					this.renderTable()
				)
			]),
			this.renderBanModal()
		]);

		poll.add(function() {
			return self.csApi.getDecisions().then(function(newData) {
				self.decisions = Array.isArray(newData) ? newData : [];
				self.filterDecisions();
				self.updateView();
			});
		}, 30);

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
