const https = require('https');
https.get("https://spry-shade-365302-default-rtdb.asia-southeast1.firebasedatabase.app/rooms/hienpham_live.json", {
  headers: { "Accept": "text/event-stream" }
}, (res) => {
  console.log("Status: ", res.statusCode);
  res.on('data', d => console.log(d.toString()));
  setTimeout(() => process.exit(0), 3000);
});
