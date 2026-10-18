const fs = require('fs');
const lines = fs.readFileSync('src/components/Feed.tsx', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(');') && lines[i+1] && lines[i+1].includes('})}')) {
        // insert before
        lines.splice(i, 0, '                        </motion.div>');
        break;
    }
}
fs.writeFileSync('src/components/Feed.tsx', lines.join('\n'));
