const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/data/topics.json'));
for (const name of ['modules/chatq-keyboard/android/src/main/assets/topics.json', 'native/ios/ChatQKeyboard/topics.json', 'ios/ChatQKeyboard/topics.json']) {
  const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source);
}
