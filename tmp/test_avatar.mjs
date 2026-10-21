import fetch from 'node-fetch';

async function main() {
  const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiSWFtaGllbiBoaWVucGhhbTIuMCIsImV4cCI6MTc5Njg4MjYxMiwiYXBwbGljYXRpb24iOjEsInVpZCI6ImI5Y2IyMzQwLTRlMWItNGQ4NS05YWMyLTAxMjRiYjJkOTFlYyIsInNlc3Npb25faWQiOiI4OTFhNTAyMC02ZjU4LTRhMjMtOWVjNi0wNTZkMWU0NGM2ZjAiLCJpYXQiOjE3ODkxMDY2MTIsInBhbmNha2VfaWQiOiI3MTdkMjIwNS0wN2NkLTQxN2YtOGNlZi1hZmNlODgwODgwMzQiLCJmYl9pZCI6IjE0NTkyNjMxMTQ2ODI1NCIsImxvZ2luX3Nlc3Npb24iOm51bGwsImZiX25hbWUiOiJJYW1oaWVuIGhpZW5waGFtMi4wIn0.NABY5AILX_Bhy0ijUQc6o852SYPwnEjClqcFuPLAF-4";
  const pageId = "100546631959960";
  const r = await fetch(`https://pages.fm/api/v1/pages/${pageId}/settings?access_token=${token}`);
  const data = await r.json();
  const pageToken = data.settings?.page_access_token;
  console.log("PageToken:", pageToken);

  const fbId = "28583378961352168"; // From user in comment
  
  // Try 1: with pageToken
  const url1 = `https://graph.facebook.com/${fbId}/picture?type=square&access_token=${pageToken}`;
  const r1 = await fetch(url1, { redirect: "manual" });
  console.log("With pageToken status:", r1.status, "location:", r1.headers.get("location"));

  // Try 2: Pancake CDN pattern
  // Pancake stores avatars in content.pancake.vn or pages.fm
  const url2 = `https://pages.fm/api/v1/pages/${pageId}/avatar/${fbId}?access_token=${token}`;
  const r2 = await fetch(url2, { redirect: "manual" });
  console.log("Pancake avatar endpoint status:", r2.status, "location:", r2.headers.get("location"));
}

main().catch(console.error);
