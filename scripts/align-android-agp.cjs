/**
 * Keeps AGP classpath in Capacitor + Cordova plugin Gradle files in sync with android/build.gradle.
 * Capacitor ships 8.13.x in node_modules; we pin older AGP in the root to avoid Windows AAPT2 crashes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rootBuild = path.join(root, 'android', 'build.gradle');
if (!fs.existsSync(rootBuild)) {
  process.exit(0);
}
const bg = fs.readFileSync(rootBuild, 'utf8');
const m = bg.match(/classpath\s+['"]com\.android\.tools\.build:gradle:([^'"]+)['"]/);
if (!m) {
  console.warn('align-android-agp: could not read AGP version from android/build.gradle');
  process.exit(0);
}
const version = m[1];
const replacement = `classpath 'com.android.tools.build:gradle:${version}'`;

const targets = [
  path.join(root, 'node_modules', '@capacitor', 'android', 'capacitor', 'build.gradle'),
  path.join(root, 'android', 'capacitor-cordova-android-plugins', 'build.gradle'),
];

let changed = false;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let s = fs.readFileSync(file, 'utf8');
  const next = s.replace(
    /classpath\s+['"]com\.android\.tools\.build:gradle:[^'"]+['"]/g,
    replacement
  );
  if (next !== s) {
    fs.writeFileSync(file, next);
    changed = true;
    console.log(`align-android-agp: updated ${path.relative(root, file)} → ${version}`);
  }
}
if (!changed && targets.some((f) => fs.existsSync(f))) {
  console.log(`align-android-agp: already aligned to ${version}`);
}
