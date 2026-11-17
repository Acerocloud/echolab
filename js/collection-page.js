/* 共用紧凑列表，详情中保留例句、笔记和发音练习。 */
import {state, save, removeUsage, removePronunciation} from './store.js';
import {getManifest} from './data.js';
import {esc, icon, openModal, closeModal, toast, collectionFeedback, removeWithAnimation} from './ui.js';
import {collectionButton,refreshCollectionButton,toggleCollection} from './collections.js';

export async function renderCollection(root,kind){
 const usage=kind==='usages';
 const [lessons,dict]=await Promise.all([getManifest(),usage?Promise.resolve({}):fetch('content/dict.json').then(r=>r.ok?r.json():{}).catch(()=>({}))]);
 const titles=new Map(lessons.map(x=>[x.id,x.titleZh || x.title || x.id]));
 const title=usage?'用法本':'读音本', other=usage?['words','pronunciations']:['words','usages'];
 const bookName={words:'生词本',usages:'用法本',pronunciations:'读音本'};
 root.innerHTML=`<div class="page-head"><div><h1>${title}</h1><p class="page-sub">${usage?'记录词语在具体语境中的用法。':'收集认识但读不准的词语。'}</p></div></div><section class="block collection-block"><div class="block-head"><h2>全部${usage?'用法':'读音'}</h2><span class="muted small" data-count></span></div><input class="field collection-search" type="search" placeholder="搜索词语、原句或笔记" aria-label="搜索${title}" data-search><div data-list></div></section>`;
 const list=root.querySelector('[data-list]'),search=root.querySelector('[data-search]'),count=root.querySelector('[data-count]');let shown=[];
 function phonetic(item){return item.phonetic || dict[String(item.word || '').toLowerCase()]?.ph || '';}
 function draw(){
  const all=Array.isArray(state[kind])?state[kind]:[],q=search.value.trim().toLowerCase();
  shown=all.filter(item=>item && (!q || [item.word,item.en,item.zh,item.explanation,item.question,item.answer,item.note].some(x=>String(x||'').toLowerCase().includes(q))));
  count.textContent=`${shown.length} ${usage?'条':'个'}`;
  if(!shown.length){list.innerHTML=`<p class="empty-line">${all.length?'没有找到匹配的记录。':`${title}还是空的，在课程里选词即可加入。`}</p>`;return;}
  list.innerHTML=`<div class="wl">${shown.map((item,i)=>`<div class="wl-row"><button class="wl-main" type="button" data-details="${i}" aria-label="查看${esc(item.word || '')}的详情"><b>${esc(item.word || '')}</b><span>${esc(usage?(item.explanation || item.en || '暂无例句'):((phonetic(item)?`/${phonetic(item)}/`:'') || item.en || '暂无音标'))}</span></button>${other.map(type=>collectionButton(type,item,i)).join('')}<button class="mini icon-only" data-remove="${i}" aria-label="移出${title}">${icon('close',13)}</button></div>`).join('')}</div>`;
 }
 function speak(item,rate){if(!window.speechSynthesis || typeof SpeechSynthesisUtterance==='undefined'){toast('浏览器暂不支持朗读');return;}const u=new SpeechSynthesisUtterance(item.word);u.lang='en-US';u.rate=rate;u.onerror=()=>toast('无法播放发音，请检查系统语音设置');window.speechSynthesis.cancel();window.speechSynthesis.speak(u);}
 function details(item){
  const ph=phonetic(item);
  openModal({title:'',body:`<div class="wc"><div class="wc-head"><div><h2 class="wc-word">${esc(item.word || '')}</h2>${!usage?`<p class="wc-ph">${ph?`/${esc(ph)}/`:'暂无音标'}</p>`:''}</div></div><div class="collection-detail-actions">${other.map(type=>collectionButton(type,item,0)).join('')}</div>${!usage?`<div class="pronunciation-actions"><button class="btn collection-pronunciation" data-play="0.92">${icon('volume',17)}<span>听发音</span></button><button class="btn btn-plain" data-play="0.7">慢速播放</button></div>`:''}${item.explanation?`<p class="usage-explanation">${esc(item.explanation)}</p>`:''}<div class="usage-example"><p class="usage-en">${item.en?esc(item.en):'<span class="muted">这条记录没有保存原句。</span>'}</p>${item.zh?`<p class="usage-zh">${esc(item.zh)}</p>`:''}</div>${item.question && item.answer?`<div class="usage-answer"><span>你的问题</span><p>${esc(item.question)}</p><span>AI 回答</span><p>${esc(item.answer)}</p></div>`:''}<label class="usage-note"><span>我的笔记</span><textarea class="field" data-detail-note rows="2" placeholder="${usage?'记下搭配、区别或例子':'记下容易读错的音或发音提示'}">${esc(item.note || '')}</textarea></label>${item.lesson && Number.isInteger(item.cue)?`<a class="usage-source" href="#/lesson/${encodeURIComponent(item.lesson)}?cue=${item.cue}" data-source>回到原句 · ${esc(titles.get(item.lesson) || item.lesson)} ↗</a>`:''}</div>`,actions:[{label:'关闭'},{label:`移出${title}`,onClick:button=>{const modal=button.closest('.modal');removeWithAnimation(button,title,()=>{if(usage)removeUsage(item.id);else removePronunciation(item.word);draw();if(document.querySelector('#layer .modal')===modal)closeModal();});return true;}}]});
  const layer=document.getElementById('layer');
  layer.querySelector('[data-detail-note]').addEventListener('input',event=>{item.note=event.target.value;save();});
  layer.querySelectorAll('[data-cross]').forEach(button=>button.addEventListener('click',()=>{const added=toggleCollection(button.dataset.cross,item);refreshCollectionButton(button,button.dataset.cross,item);draw();collectionFeedback(button,bookName[button.dataset.cross],added);}));
  layer.querySelectorAll('[data-play]').forEach(button=>button.addEventListener('click',()=>speak(item,Number(button.dataset.play))));
  layer.querySelector('[data-source]')?.addEventListener('click',()=>{layer.querySelector('.modal-foot button')?.click();});
 }
 search.addEventListener('input',draw);
 list.addEventListener('click',event=>{
  const cross=event.target.closest('[data-cross]');if(cross){const index=Number(cross.dataset.index),type=cross.dataset.cross,item=shown[index];if(item){const added=toggleCollection(type,item);draw();const replacement=list.querySelector(`[data-cross="${type}"][data-index="${index}"]`);collectionFeedback(replacement,bookName[type],added);}return;}
  const detail=event.target.closest('[data-details]');if(detail){const item=shown[Number(detail.dataset.details)];if(item)details(item);return;}
  const remove=event.target.closest('[data-remove]');if(remove){const item=shown[Number(remove.dataset.remove)];if(item)removeWithAnimation(remove.closest('.wl-row'),title,()=>{if(usage)removeUsage(item.id);else removePronunciation(item.word);draw();});}
 });
 draw();return ()=>window.speechSynthesis?.cancel();
}
