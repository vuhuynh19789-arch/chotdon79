import React, { useEffect, useState, useRef } from 'react';
import { ref, onChildAdded, remove, query, orderByChild, startAt } from 'firebase/database';
import { firebaseDb, PLATFORMS, Platform } from '../lib/core';

export default function PrintServer() {
    const [logs, setLogs] = useState<string[]>([]);
    const [activePrint, setActivePrint] = useState<string | null>(null);

    const log = (msg: string) => {
        setLogs(prev => [msg, ...prev].slice(0, 50));
    };

    useEffect(() => {
        const startTime = Date.now();
        log("Đang kết nối máy chủ in...");
        log("Đang chờ lệnh in từ điện thoại...");

        const platforms: Platform[] = ['tiktok', 'facebook', 'shopee'];
        const unsubscribes = platforms.map(p => {
            const room = PLATFORMS[p].room;
            const q = query(ref(firebaseDb, `rooms/${room}/print_queue`), orderByChild('timestamp'), startAt(startTime));
            
            return onChildAdded(q, (snapshot) => {
                const val = snapshot.val();
                if (val && val.dataUri) {
                    log(`Nhận lệnh in từ ${PLATFORMS[p].label}`);
                    setActivePrint(val.dataUri);
                    // Xóa để nhẹ DB
                    remove(snapshot.ref).catch(e => console.error("Remove failed", e));
                }
            });
        });

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };
    }, []);

    useEffect(() => {
        if (activePrint) {
            const img = new Image();
            img.onload = () => {
                setTimeout(() => {
                    window.print();
                    setTimeout(() => {
                        setActivePrint(null);
                        log("Đã gửi lệnh in xuống máy in thành công.");
                    }, 1000);
                }, 200);
            };
            img.src = activePrint;
        }
    }, [activePrint]);

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto font-sans bg-gray-50 min-h-screen">
            <h1 className="text-2xl font-bold mb-4 text-blue-700">🖨️ TRANG MÁY CHỦ IN</h1>
            
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6 text-sm text-blue-900 leading-relaxed">
                <strong>Hướng dẫn:</strong>
                <ul className="list-disc ml-5 mt-2 space-y-1">
                    <li>Hãy <strong>mở treo trang này</strong> trên máy tính (như máy quét comment) có cắm máy in.</li>
                    <li>Khi ấn nút "IN" trên điện thoại (dù ở xa), máy tính này sẽ tự động nhận lệnh và in ra luôn.</li>
                    <li>Để máy tính tự động in mà không hiện bảng hỏi (Print Dialog), bạn có thể chạy trình duyệt Chrome trên máy tính với lệnh:
                        <div className="bg-gray-800 text-green-400 p-2 rounded mt-1 font-mono text-xs">
                            "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing
                        </div>
                    </li>
                </ul>
            </div>
            
            <div className="bg-white p-4 rounded-xl shadow border border-gray-200 min-h-[300px]">
                <h2 className="font-bold border-b pb-2 mb-3 text-gray-800 flex items-center justify-between">
                    <span>Lịch sử hoạt động:</span>
                    {activePrint && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full animate-pulse">Đang in...</span>}
                </h2>
                <div className="text-[13px] font-mono text-gray-700 space-y-1.5">
                    {logs.map((l, i) => (
                        <div key={i} className="flex gap-2">
                            <span className="text-gray-400 shrink-0">[{new Date().toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', second:'2-digit'})}]</span> 
                            <span>{l}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Hidden print area */}
            <div className="print-only">
                {activePrint && <img src={activePrint} className="w-full" alt="Print" />}
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    body * { visibility: hidden; }
                    .print-only, .print-only * { visibility: visible; }
                    .print-only { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
                    img { width: 100%; max-width: 100%; display: block; object-fit: contain; }
                    @page { margin: 0; }
                }
            `}} />
        </div>
    );
}
