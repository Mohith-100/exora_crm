const fs = require('fs');
let code = fs.readFileSync('update.js', 'utf8');
code = code.replace(/\\`/g, '`');
code = code.replace(/\\\\\$/g, '$');
fs.writeFileSync('update.js', code);
