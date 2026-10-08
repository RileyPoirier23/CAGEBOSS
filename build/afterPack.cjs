// The Mac build isn't signed with an Apple developer certificate (that needs a paid Apple
// account). Apple Silicon Macs refuse to run completely unsigned apps, so give it an ad-hoc
// signature. Players still right-click > Open the first time (see the README).
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
