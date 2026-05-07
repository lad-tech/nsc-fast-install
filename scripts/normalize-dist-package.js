const fs = require('node:fs');
const path = require('node:path');

const packagePath = path.resolve(__dirname, '..', 'dist', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
