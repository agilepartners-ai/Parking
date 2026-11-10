// Starts the Expo dev server so a phone on the same Wi-Fi can open it.
// Why this exists: on Windows with WSL / Hyper-V, Expo often advertises a virtual address (like 172.x.x.x) that the phone
// cannot reach, and the phone then shows "There was a problem running the requested project: request timed out".
// This picks the real Wi-Fi / Ethernet address instead.
//
//   npm run phone           same Wi-Fi (LAN)
//   npm run phone:tunnel    works through any network / firewall (slower)
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const tunnel = process.argv.includes('--tunnel');
const virtual = /vethernet|wsl|hyper-v|virtualbox|vmware|docker|loopback|bluetooth|tailscale|zerotier|vpn/i;

function lanAddress() {
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (virtual.test(name)) continue;
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) found.push({ name, address: i.address });
    }
  }
  // prefer typical home / office ranges
  found.sort((a, b) => Number(b.address.startsWith('192.168.')) - Number(a.address.startsWith('192.168.')));
  return found[0];
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const args = ['expo', 'start', '--go'];

if (tunnel) {
  args.push('--tunnel');
  console.log('Starting with a tunnel. The first run may ask to install @expo/ngrok: answer Y.');
} else {
  const lan = lanAddress();
  if (!lan) {
    console.error('No Wi-Fi / Ethernet address found. Connect this PC to the same Wi-Fi as your phone, or run: npm run phone:tunnel');
    process.exit(1);
  }
  env.REACT_NATIVE_PACKAGER_HOSTNAME = lan.address;
  args.push('--lan');
  console.log(`Using ${lan.name} (${lan.address}). Phone and PC must be on the same Wi-Fi.`);
  console.log('If the phone still times out, Windows Firewall is blocking port 8081. Run once in an Administrator PowerShell:');
  console.log('  New-NetFirewallRule -DisplayName "Expo dev server" -Direction Inbound -Protocol TCP -LocalPort 8081,19000,19001 -Action Allow -Profile Private,Public');
  console.log('...or use: npm run phone:tunnel\n');
}

const child = spawn('npx', args, { cwd: path.join(root, 'apps', 'mobile'), env, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
