'use strict';
'require baseclass';
'require fs';

let prev = {};
let last_time = Date.now();
let ipVisible = localStorage.getItem('ipVisible') !== 'false';

(function loadDynamicCSS() {
  function isDarkMode() {
    const bgColor = getComputedStyle(document.body).backgroundColor;
    if (!bgColor) return false;

    const rgb = bgColor.match(/\d+/g);
    if (!rgb) return false;

    const [r, g, b] = rgb.map(Number);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 100;
  }

  const dark = isDarkMode();
  console.log(dark ? 'Dark mode detected' : 'Light mode detected');

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = dark ? '/luci-static/resources/netstat/netstat_dark.css' : '/luci-static/resources/netstat/netstat.css';
  document.head.appendChild(link);
})();

function getPublicIP() {
  return fs.exec('/usr/bin/curl', ['-sL', '--connect-timeout', '2', '--max-time', '3', 'https://ip.guide'])
    .then(function(res) {
      try {
        return JSON.parse(res.stdout);
      } catch (e) {
        return { ip: 'Unavailable', network: { autonomous_system: { name: 'Unknown' } } };
      }
    })
    .catch(function() {
      return { ip: 'Unavailable', network: { autonomous_system: { name: 'Unknown' } } };
    });
}

function parseStats(raw) {
  var lines = raw.trim().split('\n');
  var stats = {};
  lines.forEach(function(line) {
    var parts = line.trim().split(':');
    if (parts.length < 2) return;
    var iface = parts[0].trim().replace(/_\d+$/, '');
    var values = parts[1].trim().split(/\s+/);
    stats[iface] = {
      rx: parseInt(values[0]) || 0,
      tx: parseInt(values[8]) || 0
    };
  });
  return stats;
}

function getBestWAN(stats) {
  const blacklist = ['lo', 'br-lan', 'lan'];
  const blacklistPatterns = [/^phy/, /^wlan/, /^ra/, /^lan$/, /^lan[1-4]$/, /^vpn/, /^wg/, /^tun/, /^wl/, /^apcli/, /^sta/, /^eth\d+_\d+$/];

  let max = 0, selected = null;

  for (let iface in stats) {
    if (blacklist.includes(iface)) continue;
    if (blacklistPatterns.some(rx => rx.test(iface))) continue;

    const total = stats[iface].rx + stats[iface].tx;
    if (total > max) {
      max = total;
      selected = iface;
    }
  }
  return selected;
}

function formatRate(bits) {
  var units = ['Bps', 'Kbps', 'Mbps', 'Gbps'];
  var i = 0;
  while (bits >= 1000 && i < units.length - 1) {
    bits /= 1000;
    i++;
  }
  return {
    number: bits.toFixed(1),
    unit: units[i] + '/s'
  };
}

function formatSize(bytes) {
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return {
    number: bytes.toFixed(1),
    unit: units[i]
  };
}

return baseclass.extend({
  title: '',

  load: function () {
    return Promise.all([
      fs.read_direct('/proc/net/dev').then(parseStats).catch(() => ({})),
      getPublicIP()
    ]).then(function(results) {
      return { netStats: results[0], ipData: results[1] };
    });
  },

  render: function (data) {
    var now = Date.now();
    var dt = (now - last_time) / 1000;

    var iface = getBestWAN(data.netStats) || 'wan';
    var curr = data.netStats[iface] || { rx: 0, tx: 0 };
    var prevStat = prev[iface] || curr;

    var rxSpeed = (curr.rx - prevStat.rx) / dt;
    var txSpeed = (curr.tx - prevStat.tx) / dt;

    prev[iface] = curr;
    last_time = now;

    var org = 'Unknown';
    if (data.ipData?.network?.autonomous_system?.name)
      org = data.ipData.network.autonomous_system.name.replace(/^AS\d+\s*/, '');

    var ip = data.ipData?.ip || 'Unavailable';

    var rxRate = formatRate(rxSpeed * 8);
    var txRate = formatRate(txSpeed * 8);
    var rxTotal = formatSize(curr.rx);
    var txTotal = formatSize(curr.tx);

    const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

    var stats = [
      {
        label: _('Download'),
        valueNum: rxRate.number,
        valueUnit: rxRate.unit,
        color: colors[0]
      },
      {
        label: _('Upload'),
        valueNum: txRate.number,
        valueUnit: txRate.unit,
        color: colors[1]
      },
      {
        label: _('Total RX'),
        valueNum: rxTotal.number,
        valueUnit: rxTotal.unit,
        color: colors[2]
      },
      {
        label: _('Total TX'),
        valueNum: txTotal.number,
        valueUnit: txTotal.unit,
        color: colors[3]
      }
    ];

    var grid = E('div', { 'class': 'stats-grid' });

    stats.forEach(function(stat) {
      grid.appendChild(E('div', { 'class': 'stats-card' }, [
        E('div', { 'class': 'stat-label' }, stat.label),
        E('div', { 'class': 'stat-value' }, [
          E('span', { 'class': 'stat-number' }, stat.valueNum),
          E('br'),
          E('span', { 'class': 'stat-unit' }, stat.valueUnit)
        ]),
        E('span', {
          'class': 'iface-badge',
          'style': `margin-top: 6px; display: inline-block; padding: 2px 6px; font-size: 10px; border-radius: 4px; background-color: ${stat.color}; color: white;`
        }, iface)
      ]));
    });

    var ipVal = E('div', { 'class': 'ip-value', id: 'ip-value' }, ipVisible ? ip : '**********');
    var eye = E('img', {
      src: ipVisible ? '/luci-static/resources/netstat/eye-outline.svg' : '/luci-static/resources/netstat/eye-off-outline.svg',
      'class': 'eye-icon',
      title: _('Show/Hide IP')
    });

    eye.addEventListener('click', function() {
      ipVisible = !ipVisible;
      localStorage.setItem('ipVisible', ipVisible);
      ipVal.textContent = ipVisible ? ip : '**********';
      eye.src = ipVisible ? '/luci-static/resources/netstat/eye-outline.svg' : '/luci-static/resources/netstat/eye-off-outline.svg';
    });

    grid.appendChild(E('div', { 'class': 'ip-card full-width' }, [
      E('div', { 'class': 'ip-line' }, [ipVal, eye]),
      E('div', { 'class': 'ip-org' }, org),
      E('div', { 'class': 'bubble yellow' })
    ]));

    L.Poll.add(function () {
      return fs.read_direct('/proc/net/dev').then(function(raw) {
        var updated = parseStats(raw);
        return this.render({ netStats: updated, ipData: data.ipData });
      }.bind(this));
    }.bind(this), 1000);

    return E('div', {}, [grid]);
  }
});
