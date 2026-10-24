// One text catalog for the host app and native IME. No network or generated art.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.join(__dirname, '..'), exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/expressions.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsObject, Error });
fs.writeFileSync(path.join(root, 'modules/chatq-keyboard/android/src/main/assets/expressions.json'), JSON.stringify(exportsObject.expressions, null, 2) + '\n');
