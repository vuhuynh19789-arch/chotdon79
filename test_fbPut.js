import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
const app = initializeApp({ databaseURL: "https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app" });
const db = getDatabase(app);
onValue(ref(db, "rooms/hienpham_live"), (snap) => {
    console.log("Data:", snap.val() ? "Exists" : "Null");
    process.exit(0);
}, (err) => {
    console.error("Error:", err);
    process.exit(1);
});
