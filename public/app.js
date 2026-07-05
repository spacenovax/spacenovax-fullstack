
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
let me=null, phase={name:"Genesis Launch",reward:30}, missions=[], completed=[], totalMined=0;
const DAY=86400000;
const headers=()=>({"Content-Type":"application/json","X-Telegram-Init-Data":tg?.initData||""});
async function api(path,body={}){const r=await fetch(path,{method:"POST",headers:headers(),body:JSON.stringify({initData:tg?.initData||"",...body})});return await r.json();}
function fmt(n){return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:6,maximumFractionDigits:6});}
function reward(){return Number(me?.dailyReward||phase.reward||30);}
async function loadMe(){const r=await api("/api/me");if(!r.ok){console.log(r);return;}me=r.user;phase=r.phase;totalMined=r.totalMined;me.dailyReward=r.dailyReward;missions=r.missions||[];completed=r.completedMissions||[];renderMissions();render();}
function render(){
 const start=me?.mining_start?Number(me.mining_start):null;let display=Number(me?.balance||0),progress=0,remaining=DAY;
 if(start){const elapsed=Math.min(Date.now()-start,DAY);display+=reward()*elapsed/DAY;progress=elapsed/DAY*100;remaining=DAY-elapsed;}
 balance.textContent=fmt(display);daily.textContent=fmt(reward());speed.textContent=fmt(reward()/24)+"/hr";level.textContent="Lv."+Number(me?.level||1);phaseName.textContent=phase.name;halving.textContent=phase.name;phaseInfo.textContent=phase.name;phaseReward.textContent=fmt(phase.reward)+" / 24h";bar.style.width=progress+"%";
 const h=String(Math.floor(remaining/3600000)).padStart(2,"0"),m=String(Math.floor((remaining%3600000)/60000)).padStart(2,"0"),s=String(Math.floor((remaining%60000)/1000)).padStart(2,"0");
 timer.textContent=start?`${h}:${m}:${s}`:"24:00:00";mineBtn.textContent=start?"Mining in Progress":"Start Mining";
 if(me?.wallet) wallet.value=me.wallet;
}
function renderMissions(){
 missionList.innerHTML=missions.map(m=>{
   const isDone=completed.includes(m.id);
   return `<div class="mission"><span>${m.title}<br><small>${m.type==="instant"?"Instant reward":"Admin review"}</small></span><b>+${m.reward} SPNX</b><button onclick="claimMission('${m.id}','${m.url}')">${isDone?"Done":"Claim"}</button></div>`;
 }).join("");
}
async function claimMission(id,url){
 window.open(url,"_blank");
 setTimeout(async()=>{
   const r=await api("/api/mission/claim",{missionId:id});
   if(r.ok){ if(r.user) me=r.user; alert(r.status==="approved"?"Mission approved. Reward added.":"Mission submitted for admin review."); await loadMe(); }
   else alert(r.error||"Mission failed");
 },600);
}
mineBtn.onclick=async()=>{const r=await api("/api/mine/start");if(r.ok){me=r.user;render();if(navigator.vibrate)navigator.vibrate(60);}};
claimBtn.onclick=async()=>{const r=await api("/api/mine/claim");if(r.ok){me=r.user;phase=r.phase;alert("Claimed "+fmt(r.reward)+" SPNX Points");}else alert(r.error||"Not ready yet");render();};
saveWallet.onclick=async()=>{const r=await api("/api/wallet",{wallet:wallet.value.trim()});if(r.ok){me=r.user;alert("Wallet saved");}};
function copyRef(){navigator.clipboard?.writeText("https://t.me/SpaceNovaXAdminBot?start=ref_"+(me?.telegram_id||"demo"));alert("Referral link copied");}
document.querySelectorAll(".tabs button").forEach(btn=>{btn.onclick=()=>{document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("active"));document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));btn.classList.add("active");document.getElementById(btn.dataset.page).classList.add("active");}});
setInterval(render,1000);loadMe();
