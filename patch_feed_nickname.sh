#!/bin/bash
awk '
/<b/ {
    print $0
    getline
    print $0
    getline
    print $0
    print "                                        {store[c.platform].nicknames?.[c.user] || c.user}"
    getline
    next
}
{ print $0 }
' src/components/Feed.tsx > src/components/Feed.tsx.new
mv src/components/Feed.tsx.new src/components/Feed.tsx
