import fs from 'node:fs';

const p = 'web/src/components/ZhiCloudConsole.tsx';
let s = fs.readFileSync(p, 'utf8');

const pairs = [
  [
    "'???????????????????????????LOCAL ??????????'",
    "'\u68a6\u6821\u4e91\u76ee\u5f55\u5df2\u5c31\u7eea\uff1b\u5f53\u524d\u4e3a LOCAL \u9884\u89c8\u6a21\u5f0f\uff08\u672a\u63a5 S3 \u65f6\u4ecd\u53ef\u89c4\u5212\uff09\u3002'",
  ],
  ['`?? ?????${school} - ${major}`', '`\u6b63\u5728\u751f\u6210\u68a6\u6821\u4e91\u76ee\u5f55\uff1a${school} \u00b7 ${major}`'],
  ['`?? ??: ${err.error || err.message || err.status || \'UNKNOWN\'}`', '`\u751f\u6210\u5931\u8d25: ${err.error || err.message || err.status || \'UNKNOWN\'}`'],
  ["'?? ?????????'", "'\u68a6\u6821\u4e91\u8282\u70b9\u5df2\u751f\u6210'"],
  ["'? ????????????'", "'\u5de6\u4fa7 PINNED \u6e05\u5355\u5df2\u540c\u6b65'"],
  ["'?? ?????????'", "'\u6b63\u5728\u8fdb\u5165\u4e3b\u9a7e\u9a76\u8231\u2026'"],
  ['`?? ??: ${selectedDir.nodeName}`', '`\u63a8\u9001\u81f3: ${selectedDir.nodeName}`'],
  ["title: 'Common App ?????'", "title: 'Common App \u6587\u4e66\u5207\u7247'"],
  ['`?? ??: ${err.error || err.message || \'UNKNOWN\'}`', '`\u63a8\u9001\u5931\u8d25: ${err.error || err.message || \'UNKNOWN\'}`'],
  ["d.success ? '?? ????' : '?? ??? S3 ??'", "d.success ? '\u63a8\u9001\u6210\u529f' : '\u63a8\u9001\u5931\u8d25\uff08S3\uff09'"],
  ['???????????', '\u8fdb\u5165\u4e3b\u9a7e\u9a76\u8231\uff08\u9996\u9875\uff09\u2192'],
  ['STEP 1 ? ???', 'STEP 1 \u00b7 \u68a6\u6821\u822a\u6807'],
  ['ZHI // ???????', 'ZHI // \u68a6\u6821\u4e91\u951a\u70b9\u8bbe\u5b9a'],
  ['????????????????', '\u586b\u5199\u9662\u6821\u3001\u4e13\u4e1a\u3001\u5728\u8bfb\u5e74\u7ea7\u4e0e\u76ee\u6807\u5165\u5b66\u65f6\u95f4\uff0c\u5524\u9192\u540e\u540c\u6b65\u5de6\u4fa7\u6e05\u5355'],
  ["isGenerating ? '???????' : '? ?? ZHI?????????'", "isGenerating ? '\u6b63\u5728\u5524\u9192 ZHI\u2026' : '\u26a1 \u5524\u9192 ZHI \u00b7 \u751f\u6210\u4e91\u76ee\u5f55\u5e76\u540c\u6b65\u5de6\u4fa7'"],
  ['?????????????Sample?? S3?', '\u63a8\u9001\u793a\u4f8b\u6587\u4e66\u5207\u7247\u81f3 S3\uff08\u6f14\u793a\uff09'],
  ['??????', '\u4e91\u76ee\u5f55\u8282\u70b9'],
  ['???? ? ????', '\u6682\u65e0 \u00b7 \u5f85\u5524\u9192'],
  ['????', '\u540c\u6b65\u65e5\u5fd7'],
  ['?????????????', '\u5c55\u5f00\u68a6\u6821\u822a\u6807\u8bbe\u5b9a'],
];

for (const [from, to] of pairs) {
  if (!s.includes(from)) {
    console.warn('skip (not found):', from.slice(0, 40));
    continue;
  }
  s = s.split(from).join(to);
}

fs.writeFileSync(p, s, 'utf8');
console.log('patched', p);
