// This is a bridge file to redirect to check-env.js
// It's needed because package.json references env-check.js but the actual file is check-env.js

console.log('Running environment check...');
require('./check-env.js'); 