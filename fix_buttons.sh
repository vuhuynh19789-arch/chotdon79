#!/bin/bash
cat << 'INNER' > fix.sed
/flex flex-col gap-1.5 shrink-0/!b
n
n
n
s/.*{store\[c.platform\].nicknames?.\[c.user\] || c.user}.*/                                    {isPinned ? 'Bỏ' : 'Ghim'}/
n
n
n
s/.*/                                    className=\`w-14 h-7 rounded-md text-[13px] font-bold text-white flex items-center justify-center gap-1 \${busyPrints[c.id] ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}\`>/
n
s/.*{store\[c.platform\].nicknames?.\[c.user\] || c.user}.*//
INNER
sed -i -f fix.sed src/components/Feed.tsx
