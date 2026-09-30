const fs = require('node:fs');
const path = require('node:path');

function hasData(dir) {
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir, { withFileTypes: true }).some((entry) =>
    entry.isDirectory() ? hasData(path.join(dir, entry.name)) : entry.name !== 'README.md');
}

/** A template has neither metadata nor canonical/generated data. Partial collections fail closed. */
function collectionMode(root) {
  const collection = fs.existsSync(path.join(root, 'collection.json'));
  const glossary = fs.existsSync(path.join(root, 'glossary.json'));
  if (collection && glossary) return 'collection';
  if (collection || glossary || hasData(path.join(root, 'apis')) || hasData(path.join(root, 'dist'))) {
    throw new Error('Incomplete collection: both collection.json and glossary.json are required');
  }
  return 'template';
}

module.exports = { collectionMode };
if (require.main === module) {
  try { console.log(collectionMode(path.resolve(process.argv[2] ?? path.join(__dirname, '../../..')))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
