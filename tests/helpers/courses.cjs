const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../mountain-run/courses.js'), 'utf8');
const scope = {};
vm.runInNewContext(source, scope);
module.exports = scope.MountainCourses;
