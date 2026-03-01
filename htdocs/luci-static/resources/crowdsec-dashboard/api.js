'use strict';
'require rpc';

/**
 * CrowdSec Dashboard API
 * Package: luci-app-crowdsec-dashboard
 * RPCD object: luci.crowdsec-dashboard
 */

var callStatus = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'status',
	expect: { }
});

var callDecisions = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'decisions',
	expect: { }
});

var callAlerts = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'alerts',
	params: ['limit'],
	expect: { }
});

var callBouncers = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'bouncers',
	expect: { }
});

var callMetrics = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'metrics',
	expect: { }
});

var callMachines = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'machines',
	expect: { }
});

var callHub = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'hub',
	expect: { }
});

var callStats = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'stats',
	expect: { }
});

var callBan = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'ban',
	params: ['ip', 'duration', 'reason'],
	expect: { }
});

var callUnban = rpc.declare({
	object: 'luci.crowdsec-dashboard',
	method: 'unban',
	params: ['ip'],
	expect: { }
});

return {

	getStatus: callStatus,
	getBouncers: callBouncers,
	getMetrics: callMetrics,
	getMachines: callMachines,

	getDecisions: function() {
		return callDecisions().then(function(r) {
			return Array.isArray(r) ? r : (r && r.decisions) || [];
		});
	},

	getAlerts: function(limit) {
		return callAlerts(limit || 50).then(function(r) {
			return Array.isArray(r) ? r : (r && r.alerts) || [];
		});
	},

	getHub: function() {
		return callHub().then(function(r) {
			return r || {};
		});
	},

	getDashboardData: function() {
		return Promise.all([
			callStatus(),
			callStats(),
			callDecisions(),
			callAlerts(20)
		]).then(function(results) {
			var decisions = results[2];
			var alerts = results[3];
			return {
				status:    results[0] || {},
				stats:     results[1] || {},
				decisions: Array.isArray(decisions) ? decisions : (decisions && decisions.decisions) || [],
				alerts:    Array.isArray(alerts)    ? alerts    : (alerts    && alerts.alerts)       || []
			};
		});
	},

	banIP: function(ip, duration, reason) {
		return callBan(ip, duration || '4h', reason || 'Manual ban from dashboard');
	},

	unbanIP: function(ip) {
		return callUnban(ip);
	},

	/* ── Input validation ─────────────────────────────────────────── */

	/**
	 * Validates an IPv4 address or IPv4 CIDR range.
	 * Each octet is constrained to 0-255; prefix to 0-32.
	 */
	isValidIP: function(ip) {
		var octet = '([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])';
		var ipv4   = '(' + octet + '\\.){3}' + octet;
		var cidr   = '(\\/(\\d|[1-2]\\d|3[0-2]))?';
		return new RegExp('^' + ipv4 + cidr + '$').test(ip);
	},

	/**
	 * Validates a CrowdSec duration string (e.g. 4h, 30m, 7d, 60s).
	 */
	isValidDuration: function(dur) {
		return /^\d+(s|m|h|d)$/.test(dur);
	},

	/* ── Display utilities ────────────────────────────────────────── */

	parseScenario: function(scenario) {
		if (!scenario) return 'Unknown';
		return scenario.split('/').pop() || scenario;
	},

	formatDuration: function(duration) {
		return duration || 'N/A';
	},

	formatRelativeTime: function(timestamp) {
		if (!timestamp) return 'N/A';
		try {
			var diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
			if (diff < 0)     return 'just now';
			if (diff < 60)    return diff + 's ago';
			if (diff < 3600)  return Math.floor(diff / 60)   + 'm ago';
			if (diff < 86400) return Math.floor(diff / 3600)  + 'h ago';
			return Math.floor(diff / 86400) + 'd ago';
		} catch(e) {
			return 'N/A';
		}
	},

	getCountryFlag: function(country) {
		if (!country || country.length !== 2) return '🌐';
		var a = country.toUpperCase().codePointAt(0) - 65 + 0x1F1E6;
		var b = country.toUpperCase().codePointAt(1) - 65 + 0x1F1E6;
		return String.fromCodePoint(a) + String.fromCodePoint(b);
	}
};
