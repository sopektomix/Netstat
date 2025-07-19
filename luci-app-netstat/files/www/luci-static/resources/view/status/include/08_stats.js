'use strict';

'require baseclass';
'require fs';
'require request';

var prev = {};
var last_time = Date.now();
var ipVisible = localStorage.getItem('ipVisible') !== 'false';

(function loadNetstatCSS() {
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/luci-static/resources/netstat/netstat.css';
  document.head.appendChild(link);
})();

var callNetIP = function () {
  return request.get('/cgi-bin/luci/admin/status/netip_status')
    .then(res => res.json())
    .catch(() => ({ ip: 'Unknown', org: 'Unknown' }));
};

function parseStats(content) {
  var lines = content.trim().split('\n');
  var stats = {};
  lines.forEach(function (line) {
    var parts = line.trim().split(':');
    if (parts.length < 2) return;
    var name = parts[0].trim();
    var values = parts[1].trim().split(/\s+/);
    stats[name] = {
      rx: parseInt(values[0]) || 0,
      tx: parseInt(values[8]) || 0
    };
  });
  return stats;
}

function getActiveWAN(stats) {
  var ignore = ['lo', 'br-lan', 'lan', 'wlan0', 'wlan1'];
  var maxBytes = 0;
  var active = null;

  for (var iface in stats) {
    if (ignore.includes(iface)) continue;
    var total = (stats[iface].rx || 0) + (stats[iface].tx || 0);
    if (total > maxBytes) {
      maxBytes = total;
      active = iface;
    }
  }

  return active;
}

function formatBits(bits) {
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  let i = 0;
  while (bits >= 1000 && i < units.length - 1) {
    bits /= 1000;
    i++;
  }
  return bits.toFixed(2) + ' ' + units[i];
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return bytes.toFixed(2) + ' ' + units[i];
}

return baseclass.extend({
  title: _(''),

  load: function () {
    return Promise.all([
      fs.read_direct('/proc/net/dev').then(parseStats).catch(() => ({})),
      callNetIP()
    ]).then(([netStats, ipInfo]) => ({ netStats, ipInfo }));
  },

  render: function (data) {
    var now = Date.now();
    var timeDiff = (now - last_time) / 1000;

    var wan_iface = getActiveWAN(data.netStats) || 'wan';
    console.log("Detected WAN Interface:", wan_iface);

    var s = data.netStats[wan_iface] || { rx: 0, tx: 0 };
    s.rx = s.rx || 0;
    s.tx = s.tx || 0;
    var p = prev[wan_iface] || { rx: s.rx, tx: s.tx };

    var download_rate = (s.rx - p.rx) / timeDiff;
    var upload_rate = (s.tx - p.tx) / timeDiff;
    var total_download = s.rx;
    var total_upload = s.tx;

    prev[wan_iface] = { rx: s.rx, tx: s.tx };
    last_time = now;

    var org = (data.ipInfo.org || 'Unknown').replace(/^AS\d+\s+/, '');
    var ipRaw = data.ipInfo.ip || 'Unknown';

    var stats = [
      {
        label: _('↓ Download Speed'),
        value: formatBits(download_rate * 8) + '/s',
        icon: '/luci-static/resources/stats/download.svg'
      },
      {
        label: _('↑ Upload Speed'),
        value: formatBits(upload_rate * 8) + '/s',
        icon: '/luci-static/resources/stats/upload.svg'
      },
      {
        label: _('↓ Total Download'),
        value: formatBytes(total_download),
        icon: '/luci-static/resources/stats/download.svg'
      },
      {
        label: _('↑ Total Upload'),
        value: formatBytes(total_upload),
        icon: '/luci-static/resources/stats/upload.svg'
      }
    ];

    var container = E('div', { 'class': 'stats-grid' });

    stats.forEach(stat => {
      var card = E('div', { 'class': 'stats-card' }, [
        E('img', { src: stat.icon, class: 'stat-icon' }),
        E('div', { 'class': 'stat-label' }, stat.label),
        E('div', { 'class': 'stat-value' }, stat.value),
       E('div', { 'class': 'wan-text' }, wan_iface),
        E('div', { 'class': 'bubble' })
      ]);
      container.appendChild(card);
    });

    var ipText = E('div', {
      'class': 'ip-value',
      'id': 'ip-value'
    }, ipVisible ? ipRaw : '••••••••');

    var eyeIcon = E('img', {
      src: ipVisible ? '/luci-static/resources/stats/eye.svg' : '/luci-static/resources/stats/eye-off.svg',
      class: 'eye-icon',
      title: 'Show/Hide IP',
      id: 'eye-icon'
    });

    eyeIcon.addEventListener('click', function () {
      ipVisible = !ipVisible;
      localStorage.setItem('ipVisible', ipVisible);
      ipText.textContent = ipVisible ? ipRaw : '••••••••';
      eyeIcon.src = ipVisible ? '/luci-static/resources/stats/eye.svg' : '/luci-static/resources/stats/eye-off.svg';
    });

    var ipLine = E('div', { 'class': 'ip-line' }, [ipText, eyeIcon]);

    var ipCard = E('div', { 'class': 'ip-card full-width' }, [
      ipLine,
      E('div', { 'class': 'ip-org' }, org),
      E('div', { 'class': 'bubble yellow' })
    ]);

    container.appendChild(ipCard);

    L.Poll.add(function () {
      return fs.read_direct('/proc/net/dev').then(function (raw) {
        var updated = parseStats(raw);
        return this.render({
          netStats: updated,
          ipInfo: data.ipInfo
        });
      }.bind(this));
    }.bind(this), 1000);

    return E('div', {}, [container]);
  }
});
