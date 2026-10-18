import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(
    'className={`px-3 py-2.5 rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center gap-1 shadow-sm transition-colors ${hostMode ? \\\'bg-purple-600 hover:bg-purple-700 text-white\\\' : \\\'bg-gray-200 hover:bg-gray-300 text-gray-700\\\'}`}',
    'className={`px-3 py-2.5 rounded-lg font-bold text-[13px] whitespace-nowrap flex items-center justify-center shadow-sm transition-colors ${hostMode ? \\\'bg-purple-600 hover:bg-purple-700 text-white\\\' : \\\'bg-gray-200 hover:bg-gray-300 text-gray-700\\\'}`}'
);
fs.writeFileSync('src/App.tsx', code);
