// db.js
const { Low, JSONFile } = require('lowdb');

const adapter = new JSONFile('db.json');
const db = new Low(adapter);

async function init() {
  await db.read();
  db.data ||= { users: [], campaigns: [] };
  await db.write();
}
init();

module.exports = db;
