global.localStorage = { getItem: () => "node", setItem: () => {} };
import { fbGet } from './src/lib/core.ts';
async function test() {
  try {
    const data = await fbGet('rooms/hienpham_live/comments');
    console.log("Success:", data ? "Exists" : "Null");
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
