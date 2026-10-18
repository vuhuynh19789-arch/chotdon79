import React, { useEffect, useRef } from 'react';
import { ref, onChildAdded, remove, query, orderByChild, startAt } from 'firebase/database';
import { firebaseDb, PLATFORMS, Platform } from '../lib/core';

export default function PrintServerDaemon() {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const startTime = Date.now();
        console.log("Print Server Daemon started listening...");

        const platforms: Platform[] = ['tiktok', 'facebook', 'shopee'];
        const unsubscribes = platforms.map(p => {
            const room = PLATFORMS[p].room;
            const q = query(ref(firebaseDb, `rooms/${room}/print_queue`), orderByChild('timestamp'), startAt(startTime));
            
            return onChildAdded(q, (snapshot) => {
                const val = snapshot.val();
                if (val && val.dataUri) {
                    console.log(`Nhận lệnh in từ ${PLATFORMS[p].label}`);
                    
                    if (iframeRef.current) {
                        const iframe = iframeRef.current;
                        const doc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (doc) {
                            doc.open();
                            doc.write(`
                                <html>
                                <head>
                                    <style>
                                        @page { margin: 0; }
                                        body { margin: 0; padding: 0; }
                                        img { width: 100%; max-width: 100%; display: block; object-fit: contain; }
                                    </style>
                                </head>
                                <body>
                                    <img src="${val.dataUri}" onload="window.print();" />
                                </body>
                                </html>
                            `);
                            doc.close();
                        }
                    }
                    
                    // Xóa để nhẹ DB
                    remove(snapshot.ref).catch(e => console.error("Remove failed", e));
                }
            });
        });

        return () => {
            unsubscribes.forEach(unsub => unsub());
            console.log("Print Server Daemon stopped listening.");
        };
    }, []);

    return (
        <iframe 
            ref={iframeRef} 
            style={{ position: 'fixed', right: 0, bottom: 0, width: '0px', height: '0px', border: 'none', visibility: 'hidden', zIndex: -100 }} 
            title="Print Server Daemon"
        />
    );
}
