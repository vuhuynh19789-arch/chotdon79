#!/bin/bash
sed -i 's/tags: loadLocal(`slp_webapp_tags_${p}`),/tags: loadLocal(`slp_webapp_tags_${p}`),\n    nicknames: loadLocal(`slp_webapp_nicknames_${p}`),/g' src/store.ts
