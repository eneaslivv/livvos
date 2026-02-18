console.log("Starting basic-test...");
const fs = require('fs');
console.log('fs ok', !!fs);
const { skillLoader } = require('./skills/loader.ts');
console.log('Loaded loader:', !!skillLoader);
