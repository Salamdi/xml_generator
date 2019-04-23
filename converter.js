const fs = require('fs');
const readline = require('readline');
const mapper = require('./mapper');

const SOURCE = process.argv[2];
const DESTINATION = process.argv[3];
const readStream = fs.createReadStream(SOURCE);
const writeStream = fs.createWriteStream(DESTINATION || './corpus.xml');
const rl = readline.createInterface({
  input: readStream
});
const tab = (n = 1) => '  '.repeat(n);
writeStream.write('<?xml version="1.0" encoding="utf-8" ?>\n');
writeStream.write('<corpus>\n');
const element = (name, tabs, index, closing = false) => tab(tabs) + (closing ? `</${name}>\n` : `<${name} index="${index}">\n`);
const openElement = (name, index, tabs) => tab(tabs) + `<${name} index="${index}">\n`
const closeElement = (name, tabs) => tab(tabs) + `</${name}>\n`;
const arabicFromBuckwalter = token => token.split('').map(ch => {
  if (ch === '+') {
    return '';
  }
  return mapper.has(ch)
    ? String.fromCharCode(mapper.get(ch))
    : ch
}).join('');
const BIT = {
  open: (form, tag, features) => {
    const featAttrs = features.split('|').reduce((attrs, currAttr) => {
      if (currAttr.includes(':')) {
        let [key, value] = currAttr.split(':');
        if (key === 'LEM' || key === 'ROOT' || key === 'SP') {
          value = arabicFromBuckwalter(value);
        }
        key = key.replace(/(\+)(\w+)/, '$2');
        return `${attrs} ${key}="${value}"`;
      }
      let attr = currAttr.includes('+') ? currAttr.slice(0, currAttr.length - 1) : currAttr;
      attr = attr.replace(/(^\d)(\w+)/, '$2$1');
      attr = attr.replace(/(\()(\w+)(\))/, '$2');
      attr = attr.replace(/(\+)(\w+)/, '$2');
      return `${attrs} ${attr}=""`;
    }, '');
    writeStream.write(`${tab(4)}<bit tag="${tag}" ${featAttrs}>${arabicFromBuckwalter(form)}`);
  },
  close: () => writeStream.write(`</bit>\n`)
}
const TOKEN = {
  open: (form, tag, features, indices) => {
    const [chapter, verse, token] = indices;
    writeStream.write(openElement('token', token, 3));
    BIT.open(form, tag, features);
  },
  close: () => {
    BIT.close();
    writeStream.write(closeElement('token', 3));
  }
}
const VERSE = {
  open: (form, tag, features, indices) => {
    const [chapter, verse, token] = indices;
    writeStream.write(openElement('verse', verse, 2));
    TOKEN.open(form, tag, features, indices);
  },
  close: () => {
    TOKEN.close();
    writeStream.write(closeElement('verse', 2));
  }
}
const CHAPTER = {
  open: (form, tag, features, indices) => {
    const [chapter, verse, token] = indices;
    writeStream.write(openElement('chapter', chapter, 1));
    VERSE.open(form, tag, features, indices);
  },
  close: () => {
    VERSE.close();
    writeStream.write(closeElement('chapter', 1));
  }
}

const CURRENT = {
  chapter: 0,
  verse: 0,
  token: 0,
  bit: 0,
}

CHAPTER.open('0', '0', '0', [0, 0, 0]);

rl.on('line', line => {
  const [location, form, tag, features] = line.replace(/\((\d+):(\d+):(\d+):(\d+)\)/, '$1:$2:$3:$4').split('\t');
  const indices = location.split(':').map(strIdx => parseInt(strIdx, 10));
  const [chapter, verse, token, bit] = indices;
  if (CURRENT.chapter !== chapter) {
    CHAPTER.close();
    CHAPTER.open(form, tag, features, indices);
  } else if (CURRENT.verse !== verse) {
    VERSE.close();
    VERSE.open(form, tag, features, indices);
  } else if (CURRENT.token !== token) {
    TOKEN.close();
    TOKEN.open(form, tag, features, indices);
  } else {
    BIT.close();
    BIT.open(form, tag, features);
  }
  CURRENT.chapter = chapter;
  CURRENT.verse = verse;
  CURRENT.token = token;
});

rl.on('close', () => {
  CHAPTER.close();
  writeStream.write('</corpus>');
});
