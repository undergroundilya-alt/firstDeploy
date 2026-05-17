'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'saas-state.json');
if (fs.existsSync(file)) fs.rmSync(file);
console.log('Demo data removed:', file);
