import assert from 'node:assert/strict';
import {findWordForms, formatWordFamily} from '../js/word-forms.js';
import {readFileSync} from 'node:fs';
const forms=JSON.parse(readFileSync(new URL('../content/inflections.json',import.meta.url)));
for (const word of ['take','taking','took','taken']) {const result=findWordForms(word,null,forms); assert.equal(result.base,'take');assert.equal(result.forms.find(x=>x.label==='过去式').word,'took');assert.equal(result.forms.find(x=>x.label==='过去分词').word,'taken');}
assert.equal(findWordForms('a lot',null,forms),null);
assert.equal(findWordForms('reasons',null,forms).forms.find(x=>x.label==='名词复数').word,'reasons');
const families=JSON.parse(readFileSync(new URL('../content/word-families.json',import.meta.url)));
assert(formatWordFamily('create',families).includes('creative'));
assert(formatWordFamily('create',families).includes('creation'));
assert(formatWordFamily('happy',families).includes('happily'));
assert(formatWordFamily('create',families).includes('v.  create'));
assert(formatWordFamily('create',families).includes('n.  '));
assert(formatWordFamily('create',families).includes('adj.  '));
assert(formatWordFamily('happy',families).includes('adv.  '));
assert(formatWordFamily('unknownwordxyz',families).includes('暂未收录'));
console.log('Word roots, irregular verb forms and plural verified');
