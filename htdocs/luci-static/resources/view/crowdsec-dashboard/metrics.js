'use strict';
'require view';
'require dom';
'require poll';
'require ui';
'require crowdsec-dashboard/api as api';

/**
 * CrowdSec Dashboard - Metrics View
 * Detailed metrics from CrowdSec engine
 * Copyright (C) 2024 CyberMind.fr - Gandalf
 */

return view.extend({
	title: _('Metrics'),
	
	csApi: null,
	metrics: {},
	bouncers: [],
	machines: [],
	hub: {},

	load: function() {
		var cssLink = document.createElement('link');
		cssLink.rel = 'stylesheet';
		cssLink.href = L.resource('crowdsec-dashboard/dashboard.css');
		document.head.appendChild(cssLink);
		
		this.csApi = api;
		
		return Promise.all([
			this.csApi.getMetrics(),
			this.csApi.getBouncers(),
			this.csApi.getMachines(),
			this.csApi.getHub()
		]).then(function(results) {
			return {
				metrics: results[0],
				bouncers: results[1],
				machines: results[2],
				hub: results[3]
			};
		});
	},

	renderMetricSection: function(title, data) {
		if (!data || typeof data !== 'object') {
			return null;
		}
		
		var entries = Object.entries(data);
		if (entries.length === 0) {
			return null;
		}
		
		var items = entries.map(function(entry) {
			var value = entry[1];
			if (typeof value === 'object') {
				value = JSON.stringify(value);
			}
			return E('div', { 'class': 'cs-metric-item' }, [
				E('span', { 'class': 'cs-metric-name' }, entry[0]),
				E('span', { 'class': 'cs-metric-value' }, String(value))
			]);
		});
		
		return E('div', { 'class': 'cs-metric-section' }, [
			E('div', { 'class': 'cs-metric-section-title' }, title),
			E('div', { 'class': 'cs-metric-list' }, items)
		]);
	},

	renderBouncersTable: function() {
		var self = this;

		if (!Array.isArray(this.bouncers) || this.bouncers.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, '🔌'),
				E('p', {}, _('No bouncers registered'))
			]);
		}

		var rows = this.bouncers.map(function(b) {
			var isValid = b.is_valid !== false;
			return E('tr', {}, [
				E('td', {}, E('strong', {}, b.name || 'N/A')),
				E('td', {}, E('span', { 'class': 'cs-ip' }, b.ip_address || 'N/A')),
				E('td', {}, b.type || 'N/A'),
				E('td', {}, E('span', {
					'class': 'cs-action ' + (isValid ? 'ban' : ''),
					'style': isValid ? 'background: rgba(0,212,170,0.15); color: var(--cs-accent-green)' : ''
				}, isValid ? _('Valid') : _('Invalid'))),
				E('td', {}, E('span', { 'class': 'cs-time' }, self.csApi.formatRelativeTime(b.last_pull)))
			]);
		});

		return E('div', { 'class': 'cs-table-wrap' }, [
			E('table', { 'class': 'cs-table' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, _('Name')),
					E('th', {}, _('IP Address')),
					E('th', {}, _('Type')),
					E('th', {}, _('Status')),
					E('th', {}, _('Last Pull'))
				])),
				E('tbody', {}, rows)
			])
		]);
	},

	renderMachinesTable: function() {
		var self = this;

		if (!Array.isArray(this.machines) || this.machines.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('div', { 'class': 'cs-empty-icon' }, '🖥️'),
				E('p', {}, _('No machines registered'))
			]);
		}

		var rows = this.machines.map(function(m) {
			var isValid = m.is_validated !== false;
			return E('tr', {}, [
				E('td', {}, E('span', { 'class': 'cs-ip' }, m.machineId || 'N/A')),
				E('td', {}, m.ip_address || 'N/A'),
				E('td', {}, E('span', {
					'class': 'cs-action',
					'style': isValid
						? 'background: rgba(0,212,170,0.15); color: var(--cs-accent-green)'
						: 'background: rgba(255,107,107,0.15); color: var(--cs-accent-red)'
				}, isValid ? _('Validated') : _('Pending'))),
				E('td', {}, E('span', { 'class': 'cs-time' }, self.csApi.formatRelativeTime(m.last_heartbeat))),
				E('td', {}, m.version || 'N/A')
			]);
		});

		return E('div', { 'class': 'cs-table-wrap' }, [
			E('table', { 'class': 'cs-table' }, [
				E('thead', {}, E('tr', {}, [
					E('th', {}, _('Machine ID')),
					E('th', {}, _('IP Address')),
					E('th', {}, _('Status')),
					E('th', {}, _('Last Heartbeat')),
					E('th', {}, _('Version'))
				])),
				E('tbody', {}, rows)
			])
		]);
	},

	renderHubStats: function() {
		var hub = this.hub;

		if (!hub || typeof hub !== 'object') {
			return E('div', { 'class': 'cs-empty' }, [
				E('p', {}, _('Hub data not available'))
			]);
		}

		var collections   = hub.collections   || [];
		var parsers       = hub.parsers       || [];
		var scenarios     = hub.scenarios     || [];
		var postoverflows = hub.postoverflows || [];

		var countInstalled = function(items) {
			if (!Array.isArray(items)) return 0;
			return items.filter(function(i) { return i.installed; }).length;
		};

		var countUpdate = function(items) {
			if (!Array.isArray(items)) return 0;
			return items.filter(function(i) { return i.installed && !i.up_to_date; }).length;
		};

		var makeHubItem = function(icon, label, items) {
			var n = countInstalled(items);
			var upd = countUpdate(items);
			return E('div', { 'class': 'cs-hub-item' }, [
				E('div', { 'style': 'font-size: 22px' }, icon),
				E('div', { 'class': 'cs-hub-count' }, String(n)),
				E('div', { 'class': 'cs-hub-label' }, label),
				upd > 0
					? E('div', { 'class': 'cs-hub-sub', 'style': 'color: var(--cs-orange)' }, upd + ' ' + _('updates'))
					: E('div', { 'class': 'cs-hub-sub' }, _('up to date'))
			]);
		};

		return E('div', { 'class': 'cs-hub-grid' }, [
			makeHubItem('📦', _('Collections'),   collections),
			makeHubItem('📝', _('Parsers'),       parsers),
			makeHubItem('🔮', _('Scenarios'),     scenarios),
			makeHubItem('🔄', _('Postoverflows'), postoverflows)
		]);
	},

	renderCollectionsList: function() {
		var collections = (this.hub && this.hub.collections) ? this.hub.collections : [];

		if (!Array.isArray(collections) || collections.length === 0) {
			return E('div', { 'class': 'cs-empty' }, [
				E('p', {}, _('No collections data'))
			]);
		}

		var installed = collections.filter(function(c) { return c.installed; });

		var items = installed.slice(0, 15).map(function(c) {
			return E('div', { 'class': 'cs-metric-item' }, [
				E('span', { 'class': 'cs-metric-name' }, c.name || 'N/A'),
				E('span', {
					'class': 'cs-scenario',
					'style': c.up_to_date ? '' : 'background: rgba(255,169,77,0.15); color: var(--cs-accent-orange)'
				}, c.up_to_date ? (c.local_version || _('installed')) : _('update available'))
			]);
		});

		return E('div', { 'class': 'cs-metric-list' }, items);
	},

	renderAcquisitionMetrics: function() {
		var metrics = this.metrics;

		if (!metrics || !metrics.acquisition) {
			return E('div', { 'class': 'cs-empty' }, [
				E('p', {}, _('Acquisition metrics not available'))
			]);
		}

		var acquisition = metrics.acquisition;
		var items = [];

		Object.keys(acquisition).forEach(function(source) {
			var data = acquisition[source];
			items.push(E('div', { 'class': 'cs-activity-item' }, [
				E('div', { 'class': 'cs-activity-time' }, source),
				E('div', { 'class': 'cs-activity-text' }, [
					E('span', {}, _('Read') + ': '),
					E('strong', {}, String(data.lines_read || 0)),
					' • ' + _('Parsed') + ': ',
					E('strong', {}, String(data.lines_parsed || 0)),
					' • ' + _('Unparsed') + ': ',
					E('strong', {}, String(data.lines_unparsed || 0)),
					' • ' + _('Buckets') + ': ',
					E('strong', {}, String(data.lines_poured_to_bucket || 0))
				])
			]));
		});

		return E('div', { 'class': 'cs-activity-feed' }, items);
	},

	render: function(data) {
		var self = this;

		this.metrics  = data.metrics  || {};
		this.bouncers = data.bouncers || [];
		this.machines = data.machines || [];
		this.hub      = data.hub      || {};

		var view = E('div', { 'class': 'crowdsec-dashboard' }, [
			// Hub components
			E('div', { 'class': 'cs-card', 'style': 'margin-bottom: 18px' }, [
				E('div', { 'class': 'cs-card-header' }, [
					E('div', { 'class': 'cs-card-title' }, '🎯 ' + _('Hub Components'))
				]),
				E('div', { 'class': 'cs-card-body' }, this.renderHubStats())
			]),

			// Bouncers + Machines (side by side on wide screens)
			E('div', { 'class': 'cs-grid-2' }, [
				E('div', { 'class': 'cs-card' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, '🔒 ' + _('Registered Bouncers')),
						E('span', { 'class': 'cs-section-badge' }, String(this.bouncers.length))
					]),
					E('div', { 'class': 'cs-card-body no-padding' }, this.renderBouncersTable())
				]),
				E('div', { 'class': 'cs-card' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, '🖥️ ' + _('Registered Machines')),
						E('span', { 'class': 'cs-section-badge' }, String(this.machines.length))
					]),
					E('div', { 'class': 'cs-card-body no-padding' }, this.renderMachinesTable())
				])
			]),

			// Collections + Acquisition (side by side)
			E('div', { 'class': 'cs-grid-2' }, [
				E('div', { 'class': 'cs-card' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, '📦 ' + _('Installed Collections'))
					]),
					E('div', { 'class': 'cs-card-body' }, this.renderCollectionsList())
				]),
				E('div', { 'class': 'cs-card' }, [
					E('div', { 'class': 'cs-card-header' }, [
						E('div', { 'class': 'cs-card-title' }, '📊 ' + _('Acquisition Sources'))
					]),
					E('div', { 'class': 'cs-card-body' }, this.renderAcquisitionMetrics())
				])
			]),

			// Raw Prometheus metrics
			E('div', { 'class': 'cs-card' }, [
				E('div', { 'class': 'cs-card-header' }, [
					E('div', { 'class': 'cs-card-title' }, '📈 ' + _('Raw Prometheus Metrics'))
				]),
				E('div', { 'class': 'cs-card-body' }, [
					E('div', { 'class': 'cs-metrics-grid' }, [
						this.renderMetricSection(_('Parsers'),   this.metrics.parsers),
						this.renderMetricSection(_('Scenarios'), this.metrics.scenarios),
						this.renderMetricSection(_('Buckets'),   this.metrics.buckets),
						this.renderMetricSection(_('LAPI'),      this.metrics.lapi),
						this.renderMetricSection(_('Decisions'), this.metrics.decisions)
					].filter(Boolean))
				])
			])
		]);

		poll.add(function() {
			return Promise.all([
				self.csApi.getMetrics(),
				self.csApi.getBouncers(),
				self.csApi.getMachines()
			]).then(function(results) {
				self.metrics  = results[0];
				self.bouncers = results[1];
				self.machines = results[2];
			});
		}, 60);

		return view;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
