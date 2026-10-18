import fs from 'fs';
let code = fs.readFileSync('src/lib/core.ts', 'utf8');
code = code.replace(
`    if (!res.ok) throw new Error('put fail');`,
`    if (!res.ok) {
        const text = await res.text();
        console.error("fbPut error:", text);
        throw new Error('put fail: ' + text);
    }`
);
code = code.replace(
`    if (!res.ok) throw new Error('fetch fail');`,
`    if (!res.ok) {
        const text = await res.text();
        console.error("fbGet error:", text);
        throw new Error('fetch fail: ' + text);
    }`
);
fs.writeFileSync('src/lib/core.ts', code);
