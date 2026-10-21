const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || 'C:/Users/INO/Desktop/project/camzy';
const IMG = path.join(ROOT, 'assets', 'images');

const KEEP = {
  brands: ['hikvision', 'dahua', 'uniview', 'tiandy', 'vivotek', 'feritac', 'axis', 'hanwha', 'zyxel', 'ubiquiti', 'seagate', 'wd', 'tp-link', 'sepco'],
  categories: ['cctv-cameras', 'dvr-nvr', 'security-systems', 'lenses-imaging', 'network-equipment', 'camera-accessories', 'safety-security', 'rack-cabinet', 'installation-tools', 'storage-monitoring', 'cables-wiring', 'specialized-equipment'],
  products: ['hikvision-ds-2cd2t47wd-l3','hikvision-ds-2cd2143g2-i','dahua-hdw3441r3','uniview-ipc2124sr3-ud','tiandy-tc-s32di','hikvision-ds-7608ni-k2-8','dahua-nvr4216-4k','tiandy-td-5108k1','uniview-nvr308-32x','feritac-wireless-alarm-kit','feritac-access-control-500','feritac-speed-gate-2-lane','feritac-addressable-fire-alarm','feritac-motorized-lens-4-12mm','feritac-fixed-lens-4mm','feritac-dome-camera-housing','zyxel-gs1200-8-poe','ubiquiti-usw-flex-8-poe','ubiquiti-ubr-ir','tp-link-cat6-305m','feritac-camera-mount-bracket','feritac-camera-power-adapter-12v2a','sepco-safety-helmet','sepco-insulated-gloves','feritac-wall-rack-9u','feritac-floor-cabinet-75cm','feritac-cctv-test-probe','feritac-network-cable-tester','wd-purple-4tb','seagate-skyhawk-6tb','generic-security-monitor-22','feritac-ups-600va','tp-link-coaxial-rg59-bnc-100m','tp-link-camera-power-cable-2x1','tp-link-bnc-connector-10','feritac-pir-motion-sensor','feritac-rfid-card-tag'],
};

for (const dir of Object.keys(KEEP)) {
  const full = path.join(IMG, dir);
  if (!fs.existsSync(full)) { console.log('missing dir', dir); continue; }
  for (const f of fs.readdirSync(full)) {
    if (!f.toLowerCase().endsWith('.svg')) continue;
    const base = f.replace(/\.svg$/i, '');
    if (KEEP[dir].includes(base)) continue;
    fs.unlinkSync(path.join(full, f));
    console.log('removed', dir + '/' + f);
  }
}
console.log('\n--- uploads listing ---');
const up = path.join(IMG, 'uploads');
for (const f of fs.readdirSync(up, { withFileTypes: true })) {
  if (f.isDirectory()) {
    console.log('[dir]', f.name, fs.readdirSync(path.join(up, f.name)).length, 'files');
  } else {
    console.log(' ', f.name, fs.statSync(path.join(up, f.name)).size);
  }
}
