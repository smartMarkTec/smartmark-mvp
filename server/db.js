const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// Store database file in the backend folder (so it’s always found)
const db = new Low(new JSONFile(__dirname + '/db.json'), { users: [], campaigns: [] });

// Always ensure .data is initialized
(async () => {
  await db.read();
  db.data ||= { users: [], campaigns: [] };
  await db.write();
})();

module.exports = db;
