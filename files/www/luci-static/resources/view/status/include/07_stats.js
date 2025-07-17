'use strict';

'require baseclass';
'require fs';
'require request';

var prev = {};
var last_time = Date.now();
var ipVisible = localStorage.getItem('ipVisible') !== 'false';

var callNetIP = function () {
  return request.get('/cgi-bin/luci/admin/status/netip_status')
    .then(res => res.json())
    .catch(() => ({ ip: 'N/A', org: 'N/A' }));
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
      rx: parseInt(values[0]),
      tx: parseInt(values[8])
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
    var total = stats[iface].rx + stats[iface].tx;
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
    var s = data.netStats[wan_iface] || { rx: 0, tx: 0 };
    var p = prev[wan_iface] || { rx: s.rx, tx: s.tx };

    var rx_total = s.rx;
    var tx_total = s.tx;

    var rx_rate = (s.rx - p.rx) / timeDiff;
    var tx_rate = (s.tx - p.tx) / timeDiff;

    prev[wan_iface] = { rx: s.rx, tx: s.tx };
    last_time = now;

    var org = (data.ipInfo.org || 'N/A').replace(/^AS\d+\s+/, '');
    var ipRaw = data.ipInfo.ip || 'N/A';

    var stats = [
      {
        label: _('Download Speed'),
        value: formatBits(rx_rate * 8) + '/s',
        icon: '/luci-static/resources/stats/download.svg'
      },
      {
        label: _('Upload Speed'),
        value: formatBits(tx_rate * 8) + '/s',
        icon: '/luci-static/resources/stats/upload.svg'
      },
      {
        label: _('Total Download'),
        value: formatBytes(rx_total),
        icon: '/luci-static/resources/stats/download.svg'
      },
      {
        label: _('Total Upload'),
        value: formatBytes(tx_total),
        icon: '/luci-static/resources/stats/upload.svg'
      }
    ];

    var style = E('style', {}, `
      @keyframes bubbleMove {
        0%   { transform: translateY(0) scale(1); opacity: 0.5; }
        50%  { transform: translateY(-10px) scale(1.1); opacity: 0.7; }
        100% { transform: translateY(0) scale(1); opacity: 0.5; }
      }

      .stats-grid {
        display: grid;
        gap: 12px;
        padding: 14px;
        grid-template-columns: repeat(2, 1fr);
      }

      @media (min-width: 1024px) {
        .stats-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .full-width {
        grid-column: 1 / -1;
      }

      .stats-card {
        background-color: #e0eef8;
        border-radius: 5px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        position: relative;
        overflow: hidden;
        box-shadow: 0 2px 2px rgba(0,0,0,0.2);
        color: #000;
      }

      .ip-card {
        background-color: #fff8e0;
        border-radius: 5px;
        padding: 24px 16px;
        box-shadow: 0 2px 2px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        position: relative;
        overflow: hidden;
      }

      body.darkmode .stats-card {
        background-color: #2f2f2f !important;
        color: #f2f2f2 !important;
      }

      body.darkmode .ip-card {
        background-color: #3a3a3a !important;
        color: #f2f2f2 !important;
      }
    `);

    var container = E('div', { 'class': 'stats-grid' });

    stats.forEach(stat => {
      var card = E('div', { 'class': 'stats-card' }, [
        E('img', {
          src: stat.icon,
          style: 'height: 32px; margin-bottom: 8px;'
        }),
        E('div', { 'style': 'font-weight: bold; margin-bottom: 4px;' }, stat.label),
        E('div', { 'style': 'font-size:1.2em; color: #007bff;' }, stat.value),
        E('div', {
          'style': `
            position: absolute;
            bottom: -12px;
            right: -12px;
            width: 50px;
            height: 50px;
            background: rgba(0, 123, 255, 0.15);
            border-radius: 50%;
            animation: bubbleMove 4s infinite ease-in-out;
          `
        })
      ]);
      container.appendChild(card);
    });

    var ipText = E('div', {
      'style': 'font-weight: bold; color: #e07b00; z-index: 1;',
      'id': 'ip-value'
    }, ipVisible ? ipRaw : '••••••••');

    var eyeIcon = E('img', {
      src: ipVisible ? '/luci-static/resources/stats/eye.svg' : '/luci-static/resources/stats/eye-off.svg',
      style: 'cursor: pointer; margin-left: 8px; height: 20px;',
      title: 'Show/Hide IP',
      id: 'eye-icon'
    });

    eyeIcon.addEventListener('click', function () {
      ipVisible = !ipVisible;
      localStorage.setItem('ipVisible', ipVisible);
      ipText.textContent = ipVisible ? ipRaw : '••••••••';
      eyeIcon.src = ipVisible ? '/luci-static/resources/stats/eye.svg' : '/luci-static/resources/stats/eye-off.svg';
    });

    var ipLine = E('div', {
      'style': 'display: flex; align-items: center; justify-content: center;'
    }, [ipText, eyeIcon]);

    var ipCard = E('div', { 'class': 'ip-card full-width' }, [
      ipLine,
      E('div', { 'style': 'color: #666; z-index: 1;' }, org),
      E('div', {
        'style': `
          position: absolute;
          top: -10px;
          left: -10px;
          width: 80px;
          height: 80px;
          background: rgba(255, 200, 0, 0.15);
          border-radius: 50%;
          animation: bubbleMove 6s infinite ease-in-out;
          z-index: 0;
        `
      })
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

    return E('div', {}, [style, container]);
  }
});
