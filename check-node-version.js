const version = process.versions.node;
const major = parseInt(version.split('.')[0], 10);

if (major < 22) {
  console.error(`\x1b[31mError: Node.js >= 22 is strictly required (current: v${version}).\x1b[0m`);
  process.exit(1);
} else if (major < 24) {
  console.warn(`\x1b[33mWarning: Node.js >= 24 is recommended (current: v${version}).\x1b[0m`);
}
