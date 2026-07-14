// 更新マニフェスト（docs/arts-update-manifest.json）を、ローカルのソースファイルから生成するツール。
// 使い方: node scripts/build-manifest.js "更新メモ1" "更新メモ2" ...
// バージョンは Code.js の APP.VERSION をそのまま読み取って使う。

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const codePath = path.join(root, 'Code.js');
const code = fs.readFileSync(codePath, 'utf8');

const versionMatch = code.match(/VERSION:\s*'([^']+)'/);
if (!versionMatch) throw new Error('Code.js から APP.VERSION を読み取れませんでした。');
const version = versionMatch[1];

// Apps Script API の projects.updateContent が期待するファイル名・type（拡張子なし）に合わせる。
const fileSpecs = [
  { local: 'Code.js', name: 'Code', type: 'SERVER_JS' },
  { local: 'Index.html', name: 'Index', type: 'HTML' },
  { local: 'Script.html', name: 'Script', type: 'HTML' },
  { local: 'Style.html', name: 'Style', type: 'HTML' },
  { local: 'appsscript.json', name: 'appsscript', type: 'JSON' }
];

const files = fileSpecs.map(spec => ({
  name: spec.name,
  type: spec.type,
  source: fs.readFileSync(path.join(root, spec.local), 'utf8')
}));

const notes = process.argv.slice(2);

const manifest = { version, notes, files };

const outPath = path.join(root, 'docs', 'arts-update-manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('生成しました:', outPath);
console.log('version:', version);
console.log('notes:', notes.length ? notes : '(なし)');
