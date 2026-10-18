#!/bin/bash
awk '
/printNewOrder: \(platform, user, content, price, time, sourceCommentId\) => \{/ {
    print $0
    print "            get().recordOrder(platform, user, price, content, sourceCommentId);"
    print "            if (sourceCommentId) {"
    print "                get().markPrinted(platform, sourceCommentId);"
    print "                get().unpinComment(platform, sourceCommentId);"
    print "            }"
    print "            const nickname = get()[platform].nicknames?.[user];"
    print "            printLabel(nickname || user, content, price, time, PLATFORMS[platform].label);"
    print "        },"
    next
}
/printLabel\(user, content, price, time, PLATFORMS\[platform\].label\);/ { next }
/get\(\)\.recordOrder\(platform, user, price, content, sourceCommentId\);/ { next }
/get\(\)\.markPrinted\(platform, sourceCommentId\);/ { next }
/get\(\)\.unpinComment\(platform, sourceCommentId\);/ { next }
/if \(sourceCommentId\) \{/ { next }
/\} \{/ {
    if (inPrintOrder) { next }
}
{ print $0 }
' src/store.ts > src/store.ts.new
mv src/store.ts.new src/store.ts
