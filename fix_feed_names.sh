#!/bin/bash
sed -i 's/{store\[c.platform\].nicknames?\.\[c.user\] || c.user}/{store\[c.platform\].nicknames?\.\[c.user\] ? \`\${c.user} (\${store\[c.platform\].nicknames\[c.user\]})\` : c.user}/g' src/components/Feed.tsx
