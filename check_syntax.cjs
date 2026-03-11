const fs = require('fs');
const vm = require('vm');
const content = fs.readFileSync('d:\\Job\\shedule_teaching\\appsscript\\Backend.gs', 'utf8');

try {
    new vm.Script(content);
    console.log('✅ Syntax OK');
} catch (e) {
    console.error('❌ Syntax Error:');
    console.error(e.message);
    console.error('At: ' + e.stack.split('\n')[0]);
}
