// This script allows us to use different NODE_OPTIONS
// depending on the node version.
let options = '--no-warnings ';

const NODE_MAJOR_VERSION = process.versions.node.split('.')[0];
if (NODE_MAJOR_VERSION >= 22) {
  options += '--no-experimental-global-navigator ';
}

process.stdout.write(options);
