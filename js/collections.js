import {state, save, toggleWord, usageKey, saveUsage, removeUsage, hasPronunciation, addPronunciation, removePronunciation} from './store.js';
import {explanationKey} from './word-explanations.js';
import {esc, icon} from './ui.js';
const names={words:'生词本',usages:'用法本',pronunciations:'读音本'};
const wordOf=item=>String(item.sourceWord || item.word || item.w || '').trim().replace(/\s+/g,' ').toLowerCase();
export function collectionEntry(kind,item){
 const word=wordOf(item);if(!word)return null;
 if(kind==='words')return state.words.find(entry=>entry.w===word || (entry.sourceWord || '').toLowerCase()===word) || null;
 if(kind==='pronunciations')return (state.pronunciations || []).find(entry=>String(entry.word || '').toLowerCase()===word) || null;
 const lesson=item.lesson || '', cue=item.cue, en=item.en || '';
 return (state.usages || []).find(entry=>String(entry.word || '').toLowerCase()===word && entry.lesson===lesson &&
   (Number.isInteger(cue)?entry.cue===cue:!Number.isInteger(entry.cue)) && (!en || entry.en===en)) || null;
}
export function collectionButton(kind,item,index){
 const selected=!!collectionEntry(kind,item),name=names[kind];
 return `<button type="button" class="collection-cross collection-${kind}${selected?' is-selected':''}" data-cross="${kind}" data-index="${index}" aria-pressed="${selected}" aria-label="${selected?'移出':'加入'}${name}">${selected?`移出${name}`:`${icon('plus',15)}<span>${name}</span>`}</button>`;
}
export function refreshCollectionButton(button,kind,item){
 const selected=!!collectionEntry(kind,item),name=names[kind];
 button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));button.setAttribute('aria-label',`${selected?'移出':'加入'}${name}`);
 button.innerHTML=selected?`移出${name}`:`${icon('plus',15)}<span>${name}</span>`;
}
export function toggleCollection(kind,item){
 const word=wordOf(item),existing=collectionEntry(kind,item);if(!word)return false;
 if(existing){if(kind==='words')toggleWord(existing.w,'');else if(kind==='usages')removeUsage(existing.id);else removePronunciation(word);return false;}
 if(kind==='words'){
   toggleWord(word,item.lesson || '');const entry=state.words.find(x=>x.w===word);
   if(entry){entry.cue=item.cue;entry.en=item.en || '';entry.zh=item.zh || '';entry.sourceWord=word;save(true);}
 }else if(kind==='pronunciations'){
   addPronunciation({word,phonetic:item.phonetic || '',lesson:item.lesson || '',cue:item.cue,en:item.en || '',zh:item.zh || ''});
 }else{
   const lesson=item.lesson || '',cue={i:item.cue,en:item.en || '',zh:item.zh || ''};
   const conversation=state.sentenceChats?.[JSON.stringify([lesson,cue.i,cue.en])] || [];
   const last=Array.isArray(conversation)?conversation.findLastIndex(x=>x?.role==='assistant'):-1;
   saveUsage({id:usageKey(word,lesson,cue),word,lesson,cue:cue.i,en:cue.en,zh:cue.zh,
     explanation:item.explanation || state.wordExplanations?.[explanationKey(lesson,cue,word)] || '',
     question:item.question || (last>0 && conversation[last-1]?.role==='user'?conversation[last-1].content:''),
     answer:item.answer || (last>=0?conversation[last].content:'')});
 }
 return true;
}
