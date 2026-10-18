#!/bin/bash
awk '
/<button/ {
    if (inCustomerTable) {
        inButton = 1
    }
}
/onClick=\{.*onOpenProfile\?.*/ {
    if (inCustomerTable) {
        inProfileClick = 1
    }
}
/\{row.user\}/ {
    if (inProfileClick && inButton) {
        gsub(/\{row\.user\}/, "{store[row.platform].nicknames?.[row.user] || row.user}")
    }
}
/<\/button>/ {
    if (inCustomerTable) {
        inButton = 0
        inProfileClick = 0
    }
}
/DANH SÁCH KHÁCH HÀNG/ {
    inCustomerTable = 1
}
{ print $0 }
' src/components/Modals.tsx > src/components/Modals.tsx.new
mv src/components/Modals.tsx.new src/components/Modals.tsx
