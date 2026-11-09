// Shared by every page. Needs icons.js first.
const OWNER='nawafalsawed-web', REPO='ahdaf-snap-archive', API=`https://api.github.com/repos/${OWNER}/${REPO}`;
const TZ='Asia/Riyadh';

const esc=t=>String(t??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const qs=k=>new URLSearchParams(location.search).get(k);
const N=n=>Number(n).toLocaleString('en-US');
const D=(d,o)=>new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory',{timeZone:TZ,...o}).format(d);
const dDay=d=>D(d,{weekday:'long',day:'numeric',month:'long'});
const dTime=d=>D(d,{hour:'numeric',minute:'2-digit'});
const dFull=d=>D(d,{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
const ago=d=>{const m=Math.round((Date.now()-d)/60000);return m<1?'الحين':m<60?`قبل ${N(m)} دقيقة`:m<1440?`قبل ${N(Math.round(m/60))} ساعة`:dFull(d)};

// upcoming | live | ended
const phase=c=>{const n=Date.now();return n<new Date(c.from)?'upcoming':n>new Date(c.to)?'ended':'live'};
const PH={upcoming:'لم تبدأ',live:'شغّالة الحين',ended:'انتهت'};
const phasePill=c=>{const p=phase(c);return `<span class="pill ${p==='live'?'ok':p==='upcoming'?'fix':''}">${PH[p]}</span>`};
const period=c=>`${dFull(new Date(c.from))} ← ${dFull(new Date(c.to))}`;

const getJson=p=>fetch(p+(p.includes('?')?'&':'?')+'t='+Date.now()).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()});

// ---- GitHub (writes only; a fine-grained token with Contents: write on this repo, kept in the browser)
const TOK_KEY='snap-archive-gh-token';
let tok=''; try{tok=localStorage.getItem(TOK_KEY)||''}catch(e){}
const setTok=v=>{tok=v;try{v?localStorage.setItem(TOK_KEY,v):localStorage.removeItem(TOK_KEY)}catch(e){}};
const tokUrl=`https://github.com/settings/personal-access-tokens/new?name=snap-archive&description=${encodeURIComponent('أرشيف سناب: إضافة الحملات')}&target_name=${OWNER}&expires_in=none&contents=write`;
async function gh(path,opt={}){
 const r=await fetch(API+path,{...opt,headers:{Authorization:'Bearer '+tok,Accept:'application/vnd.github+json',...(opt.headers||{})}});
 if(!r.ok)throw new Error({401:'المفتاح غير صحيح أو انتهى',403:'المفتاح ما عنده صلاحية كافية',404:'المفتاح ما يوصل لمستودع الأرشيف',409:'فيه حفظ ثاني صار بنفس الوقت، جرّب مرة ثانية'}[r.status]||`GitHub ${r.status}`);
 return r.json();
}
const b64=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const unb64=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g,'')),c=>c.charCodeAt(0)));
// read-modify-write campaigns.json straight from the repo (Pages lags a minute behind)
async function editCampaigns(fn,msg){
 const f=await gh(`/contents/campaigns.json?ref=main&t=${Date.now()}`);
 const list=fn(JSON.parse(unb64(f.content)));
 await gh('/contents/campaigns.json',{method:'PUT',body:JSON.stringify({message:msg,sha:f.sha,content:b64(JSON.stringify(list,null,1)+'\n')})});
 return list;
}

function topbar(crumb){
 const h=document.createElement('header'); h.className='topbar';
 h.innerHTML=`<div class="wrap"><a class="logo" href="./" aria-label="أهداف"><img src="a/logo-purple.png" alt="أهداف"></a>
  <nav><a href="./">الحملات</a><a href="edit.html">${ic('plus')} حملة جديدة</a></nav>
  <div class="sp"></div>${crumb?`<div class="crumb">${crumb}</div>`:''}</div>`;
 document.body.prepend(h);
}
function toast(msg,icon='circle-check-big'){
 let el=document.querySelector('.toast'); if(!el){el=document.createElement('div');el.className='toast';el.setAttribute('role','status');document.body.appendChild(el)}
 el.innerHTML=ic(icon)+esc(msg); el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2600);
}
