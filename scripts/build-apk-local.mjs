// Builds a release APK on this computer (no Expo cloud build, so no EAS build credits used).
//
//   npm run build:apk
//
// Needs: Node, JDK 17+ (JAVA_HOME or `java` on PATH) and the Android SDK (ANDROID_HOME, default %LOCALAPPDATA%\Android\Sdk).
// Output: release-artifacts/ParkPay-<version>-local.apk  (signed with a DEBUG key: fine for testing and GitHub pre-releases, not for Google Play)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'apps', 'mobile');
const android = path.join(mobile, 'android');
const win = process.platform === 'win32';

function fail(msg) {
  console.error('\n' + msg);
  process.exit(1);
}

// --- environment ---------------------------------------------------------------------------
const env = { ...process.env };

const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || (win ? path.join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : path.join(homedir(), 'Android', 'Sdk'));
if (!existsSync(sdk)) fail(`Android SDK not found at ${sdk}. Install Android Studio or set ANDROID_HOME.`);
env.ANDROID_HOME = sdk;

if (!env.JAVA_HOME) {
  const probe = spawnSync(win ? 'where' : 'which', ['java'], { encoding: 'utf8' });
  const java = probe.stdout?.split(/\r?\n/).find(Boolean);
  if (!java) fail('Java not found. Install a JDK 17 or newer, or set JAVA_HOME.');
  env.JAVA_HOME = path.dirname(path.dirname(java));
}

// Some networks make Java's first connection time out while curl works: prefer IPv4.
env.JAVA_TOOL_OPTIONS = [env.JAVA_TOOL_OPTIONS, '-Djava.net.preferIPv4Stack=true'].filter(Boolean).join(' ');
// Keep secrets out of the console: the app reads EXPO_PUBLIC_* values from apps/mobile/.env during the bundle step.

const run = (cmd, args, cwd, label) => {
  console.log(`\n> ${label}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win });
  if (r.status !== 0) fail(`Step failed: ${label}`);
};

// --- 1. native project ---------------------------------------------------------------------
run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], mobile, 'Generate the native Android project (expo prebuild)');

writeFileSync(path.join(android, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);

// the default 10 s download timeout is too short on slow connections
const wrapper = path.join(android, 'gradle', 'wrapper', 'gradle-wrapper.properties');
if (existsSync(wrapper)) writeFileSync(wrapper, readFileSync(wrapper, 'utf8').replace(/networkTimeout=\d+/, 'networkTimeout=120000'));

// --- 2. gradle -----------------------------------------------------------------------------
run(win ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--no-daemon'], android, 'Build the release APK (first run downloads several GB and can take 10 to 20 minutes)');

// --- 3. collect ----------------------------------------------------------------------------
const apk = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(apk)) fail(`Build finished but ${apk} is missing.`);
const version = /^\s*version:\s*'([^']+)'/m.exec(readFileSync(path.join(mobile, 'app.config.ts'), 'utf8'))?.[1] ?? '0.0.0';
const out = path.join(root, 'release-artifacts');
mkdirSync(out, { recursive: true });
const dest = path.join(out, `ParkPay-${version}-local.apk`);
copyFileSync(apk, dest);
console.log(`\nDone: ${dest}`);
console.log('Install on a device or emulator:  adb install -r "' + dest + '"');
