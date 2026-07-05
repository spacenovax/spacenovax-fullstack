
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
let me=null, phase={name:"Genesis Launch",reward:30}, phases=[], missions=[], completed=[], totalMined=0;
const DAY=86400000;
const headers=()=>({"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData||""});
async function api(path,body={}){const r=await fetch(path,{method:"POST",headers:headers(),body:JSON.stringify({initData:tg?.initData||"",...body})});return await r.json();}
function fmt(n){return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:6,maximumFractionDigits:6});}
function reward(){return Number(me?.dailyReward||phase.reward||30);}
function lvlName(l){if(l>=20)return"Universe"; if(l>=10)return"Galaxy"; if(l>=7)return"Captain"; if(l>=5)return"Nova"; return"Explorer";}
function levelBonusNum(level){ if(level>=20)return 1.0; if(level>=10)return .5; if(level>=5)return .2; return Math.max(0,(level-1)*.05); }
function referralBonusNum(ref){ if(ref>=500)return .5; if(ref>=100)return .3; if(ref>=50)return .2; if(ref>=20)return .1; if(ref>=5)return .05; return 0; }
async function loadMe(){
 const r=await api("/api/me"); if(!r.ok){console.log(r);return;}
 me=r.user; phase=r.phase; phases=r.phases||[]; totalMined=r.totalMined; me.dailyReward=r.dailyReward; missions=r.missions||[]; completed=r.completedMissions||[];
 renderMissions(); renderPhases(); render();
}
function liveBalance(){
 const start=me?.mining_start?Number(me.mining_start):null; let display=Number(me?.balance||0), progress=0, remaining=DAY;
 if(start){const elapsed=Math.min(Date.now()-start,DAY); display+=reward()*elapsed/DAY; progress=elapsed/DAY*100; remaining=DAY-elapsed;}
 return {display,progress,remaining,start};
}
function render(){
 if(!me)return;
 const l=Number(me.level||1), xp=Number(me.xp||0), ref=Number(me.referrals||0);
 const {display,progress,remaining,start}=liveBalance();
 balance.textContent=fmt(display); miningBalance.textContent=fmt(display);
 daily.textContent=fmt(reward()); speed.textContent=fmt(reward()/24)+"/hr"; perSec.textContent="+"+fmt(reward()/86400)+" SPNX / sec";
 userName.textContent=me.first_name||me.username||"Space Explorer";
 levelName.textContent=`Lv.${l} ${lvlName(l)}`; xpText.textContent=`${Math.floor(xp%1000)} / 1000 XP`; xpbar.style.width=((xp%1000)/1000*100)+"%";
 levelBonus.textContent="+"+Math.round(levelBonusNum(l)*100)+"%"; refBonus.textContent="+"+Math.round(referralBonusNum(ref)*100)+"%"; refBonus2.textContent=refBonus.textContent; refCount.textContent=ref;
 baseRate.textContent=fmt(phase.reward)+" / 24h"; phaseInfo.textContent=phase.name; totalRate.textContent=fmt(reward())+" / 24h"; nextReward.textContent="+"+fmt(reward())+" SPNX";
 phaseName.textContent=phase.name; halving.textContent=phase.name; phaseReward.textContent=fmt(phase.reward)+" / 24h";
 bar.style.width=progress+"%"; miningStatus.textContent=start?"Mining in Progress":"Mining Ready";
 const h=String(Math.floor(remaining/3600000)).padStart(2,"0"),m=String(Math.floor((remaining%3600000)/60000)).padStart(2,"0"),s=String(Math.floor((remaining%60000)/1000)).padStart(2,"0");
 timer.textContent=start?`${h}:${m}:${s}`:"24:00:00"; mineBtn.textContent=start?"Mining in Progress":"Start Mining";
 if(me.wallet) wallet.value=me.wallet;
 refCode.textContent="SPNX"+String(me.telegram_id).slice(-6).toUpperCase();
}
function renderMissions(){
 missionList.innerHTML=missions.map(m=>{
   const done=completed.includes(m.id);
   return `<div class="mission"><div class="mi">${m.icon||"⭐"}</div><div><strong>${m.title}</strong><small>${m.type==="instant"?"Instant reward":"Admin review"}</small><b>+${m.reward} SPNX</b></div><button onclick="claimMission('${m.id}','${m.url}')">${done?"Done":"Go"}</button></div>`;
 }).join("");
}
function renderPhases(){
 phaseList.innerHTML=(phases.length?phases:[phase]).map((p,i)=>`<div class="phase-item"><div class="phase-dot"></div><div><strong>Phase ${i+1} · ${p.name}</strong><br><b>${fmt(p.reward)} SPNX / 24h</b><br><small>Cap: ${Number(p.cap).toLocaleString()} SPNX</small></div></div>`).join("");
}
async function claimMission(id,url){
 window.open(url,"_blank");
 setTimeout(async()=>{const r=await api("/api/mission/claim",{missionId:id}); if(r.ok){if(r.user)me=r.user; alert(r.status==="approved"?"Mission approved. Reward added.":"Mission submitted for admin review."); await loadMe();}else alert(r.error||"Mission failed");},700);
}
mineBtn.onclick=async()=>{const r=await api("/api/mine/start"); if(r.ok){me=r.user; render(); if(navigator.vibrate)navigator.vibrate(70);}};
claimBtn.onclick=async()=>{const r=await api("/api/mine/claim"); if(r.ok){me=r.user;phase=r.phase;alert("Claimed "+fmt(r.reward)+" SPNX Points");}else alert(r.error||"Not ready yet"); render();};
checkinBtn.onclick=async()=>{const r=await api("/api/checkin"); if(r.ok){me=r.user;alert("Daily check-in +"+r.reward+" SPNX");}else alert(r.error||"Already checked in"); render();};
saveWallet.onclick=async()=>{const r=await api("/api/wallet",{wallet:wallet.value.trim()}); if(r.ok){me=r.user;alert("Wallet saved");}};
function copyRef(){navigator.clipboard?.writeText("https://t.me/SpaceNovaXAdminBot?start=ref_"+(me?.telegram_id||"demo"));alert("Referral link copied");}
document.querySelectorAll(".bottom button").forEach(btn=>{btn.onclick=()=>{document.querySelectorAll(".bottom button").forEach(b=>b.classList.remove("active"));document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));btn.classList.add("active");document.getElementById(btn.dataset.page).classList.add("active");}});
document.querySelectorAll(".seg button").forEach(btn=>{btn.onclick=()=>{document.querySelectorAll(".seg button").forEach(b=>b.classList.remove("active"));document.querySelectorAll(".sub").forEach(s=>s.classList.remove("active"));btn.classList.add("active");document.getElementById(btn.dataset.sub).classList.add("active");};});
setInterval(render,1000);loadMe();
