/* Build local lexical relations from Princeton WordNet 3.0 data files. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dict = path.join(root, '.cache', 'wordnet', 'WordNet-3.0', 'dict');
const entries = new Map(), synsets = new Map(), pointers = [];
const posMap = {n:'n',v:'v',a:'a',s:'a',r:'r'};
const single = w => /^[a-z]+(?:-[a-z]+)*$/.test(w);
function entry(word) { if (!entries.has(word)) entries.set(word, {p:new Set(), n:new Set(), v:new Set(), a:new Set(), r:new Set()}); return entries.get(word); }
for (const filename of ['data.noun','data.verb','data.adj','data.adv']) {
  const lines=fs.readFileSync(path.join(dict, filename),'utf8').split(/\r?\n/);
  for(const line of lines){
    if(!/^\d{8} /.test(line)) continue;
    const parts=line.split(' | ')[0].trim().split(/\s+/);
    const offset=parts[0], sourcePos=posMap[parts[2]], count=parseInt(parts[3],16), words=[];
    if(!sourcePos || !Number.isFinite(count)) throw new Error('Invalid synset');
    let i=4;
    for(let n=0;n<count;n++,i+=2){const word=parts[i].toLowerCase();words.push(word);if(single(word))entry(word).p.add(sourcePos);}
    synsets.set(sourcePos+':'+offset,words);
    const pointersCount=Number(parts[i++]);
    for(let n=0;n<pointersCount;n++){
      const symbol=parts[i++], targetOffset=parts[i++], targetPos=posMap[parts[i++]], pair=parts[i++];
      const sourceIndex=parseInt(pair.slice(0,2),16), targetIndex=parseInt(pair.slice(2,4),16);
      if((symbol==='+' || (symbol==='\\' && sourcePos==='r' && targetPos==='a')) && sourceIndex>0 && targetIndex>0 && targetPos){
        pointers.push({source:words[sourceIndex-1],sourcePos,targetPos,targetOffset,targetIndex});
      }
    }
  }
}
for(const p of pointers){
  const target=synsets.get(p.targetPos+':'+p.targetOffset)?.[p.targetIndex-1];
  if(!p.source || !target || !single(p.source) || !single(target))continue;
  entry(p.source)[p.targetPos].add(target);
  entry(target)[p.sourcePos].add(p.source);
}
const result={};
for(const [word,data] of entries){
  const related={};
  for(const pos of ['n','v','a','r']){
    const words=[...data[pos]].filter(w=>w!==word).sort();
    if(data.p.has(pos)) words.unshift(word);
    if(words.length)related[pos]=words;
  }
  if(Object.keys(related).length)result[word]=related;
}
fs.writeFileSync(path.join(root,'content','word-families.json'),JSON.stringify(result));
console.log('WordNet entries:',Object.keys(result).length,'relations:',pointers.length);
