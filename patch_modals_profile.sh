#!/bin/bash
awk '
/const cust = store\[platform\].customers\[user\];/ {
    print $0
    print "    const initialNickname = store[platform].nicknames?.[user] || \"\";"
    print "    const [nickname, setNickname] = useState(initialNickname);"
    next
}
/<CopyButton text={user} className="text-lg" \/>/ {
    print $0
    print "                    </div>"
    print "                    <div className=\"mb-6 flex flex-col gap-1\">"
    print "                        <label className=\"text-xs font-bold text-gray-500 ml-1\">Tên gợi nhớ:</label>"
    print "                        <input"
    print "                            type=\"text\""
    print "                            value={nickname}"
    print "                            onChange={e => setNickname(e.target.value)}"
    print "                            onBlur={() => store.setCustomerNickname(platform, user, nickname.trim())}"
    print "                            placeholder=\"VD: Chị Bảy chốt đơn...\""
    print "                            className=\"w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-800 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all\""
    print "                        />"
    next
}
{ print $0 }
' src/components/Modals.tsx > src/components/Modals.tsx.new
mv src/components/Modals.tsx.new src/components/Modals.tsx
