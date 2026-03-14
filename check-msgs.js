const Database = require("better-sqlite3");
const db = new Database("store/messages.db");
const msgs = db.prepare(`SELECT chat_jid, sender_name, content, timestamp, is_from_me FROM messages WHERE timestamp > datetime('now', '-48 hours') ORDER BY chat_jid, timestamp`).all();

let currentJid = "";
for (const m of msgs) {
  if (m.chat_jid !== currentJid) {
    currentJid = m.chat_jid;
    console.log("\n=== Channel: " + m.chat_jid + " ===");
  }
  const sender = m.is_from_me ? "Mithrandir" : m.sender_name;
  console.log("[" + m.timestamp + "] " + sender + ": " + (m.content || "").slice(0, 200));
}
