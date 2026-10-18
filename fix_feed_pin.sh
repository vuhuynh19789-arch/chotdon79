#!/bin/bash
sed -i "s/{isPinned ? 'Bỏ' : 'Ghim'}/{isPinned ? '📌 Bỏ' : '📌 Ghim'}/g" src/components/Feed.tsx
