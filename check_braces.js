const fs = require('fs');
const css = fs.readFileSync('/root/poznote-dev/src/css/index.css', 'utf8');
let braceCount = 0;
let lineNumber = 1;
let inComment = false;
let inString = false;
let stringChar = '';
let stack = [];

for (let i = 0; i < css.length; i++) {
  const char = css[i];
  if (char === '\n') {
    lineNumber++;
  }
  if (inComment) {
    if (char === '*' && css[i + 1] === '/') {
      inComment = false;
      i++; // skip /
    }
    continue;
  }
  if (inString) {
    if (char === stringChar && css[i - 1] !== '\\') {
      inString = false;
    }
    continue;
  }
  if (char === '/' && css[i + 1] === '*') {
    inComment = true;
    i++; // skip *
    continue;
  }
  if (char === '"' || char === "'") {
    inString = true;
    stringChar = char;
    continue;
  }
  if (char === '{') {
    braceCount++;
    stack.push({type: '{', line: lineNumber});
  } else if (char === '}') {
    braceCount--;
    if (braceCount < 0) {
      console.log('Extra } at line', lineNumber);
      break;
    }
    stack.pop();
  }
}

if (braceCount > 0) {
  console.log('Unclosed blocks:');
  for (let item of stack) {
    console.log('Unclosed', item.type, 'at line', item.line);
  }
} else if (braceCount < 0) {
  console.log('Extra } , count:', -braceCount);
} else {
  console.log('Braces balanced');
}
