#!/bin/bash
awk '
/setCustomerTag: \(platform, user, tag\) => \{/ {
    print "        setCustomerNickname: (platform, user, nickname) => {"
    print "            const state = get()[platform];"
    print "            const newNicknames = { ...state.nicknames, [user]: nickname };"
    print "            if (!nickname) delete newNicknames[user];"
    print "            const now = Date.now();"
    print "            set(s => ({ [platform]: { ...s[platform], nicknames: newNicknames, lastNicknamesAt: now } }));"
    print "            localStorage.setItem(`slp_webapp_nicknames_${platform}`, JSON.stringify(newNicknames));"
    print "            pushData(platform, \"nicknames\", newNicknames, now);"
    print "        },"
    print ""
}
{ print $0 }
' src/store.ts > src/store.ts.new
mv src/store.ts.new src/store.ts
