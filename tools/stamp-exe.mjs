/**
 * Stamp the icon and version info into the Windows .exe without Wine (pure JS, via resedit).
 * Used by `npm run dist:win:nowine` when building on Linux/macOS; on Windows electron-builder
 * does this itself.
 *   node tools/stamp-exe.mjs release/win-unpacked/"CAGE BOSS.exe" build/icon.ico
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as ResEdit from 'resedit';

const [exePath, icoPath] = process.argv.slice(2);
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const exe = ResEdit.NtExecutable.from(readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);

const ico = ResEdit.Data.IconFile.from(readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const groupId = groups.length ? groups[0].id : 1;
const lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

const vers = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = vers[0] ?? ResEdit.Resource.VersionInfo.createEmpty();
const [ma, mi, pa] = pkg.version.split('.').map(Number);
vi.setFileVersion(ma, mi, pa, 0, 1033);
vi.setProductVersion(ma, mi, pa, 0, 1033);
vi.setStringValues({ lang: 1033, codepage: 1200 }, {
  ProductName: pkg.build.productName,
  FileDescription: pkg.build.productName,
  CompanyName: pkg.author,
  LegalCopyright: pkg.build.copyright,
  OriginalFilename: pkg.build.productName + '.exe',
  InternalName: pkg.build.productName,
  ProductVersion: pkg.version,
  FileVersion: pkg.version,
});
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
writeFileSync(exePath, Buffer.from(exe.generate()));
console.log(`stamped icon + version ${pkg.version} into ${exePath}`);
