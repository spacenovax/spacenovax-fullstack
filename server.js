
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "spacenovax-admin";

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

const memory = { users: new Map(), claims: [], checkins: new Map(), totalMined: 0 };

const PHASES = [
  { name: "Genesis Launch", cap: 500000000, reward: 30 },
  { name: "Lunar Mission", cap: 1000000000, reward: 15 },
  { name: "Orbital Expansion", cap: 1500000000, reward: 7.5 },
  { name: "Deep Space", cap: 2000000000, reward: 3.75 },
  { name: "Interstellar", cap: 2500000000, reward: 1.875 },
  { name: "Nova Era", cap: 3000000000, reward: 0.9375 }
];

const MISSIONS = [
  { id:"website", icon:"🌐", title:"Visit Website", reward:100, url:process.env.WEBSITE_URL || "https://spacenovax.com", type:"instant" },
  { id:"telegram_channel", icon:"💬", title:"Join Telegram Channel", reward:200, url:process.env.TELEGRAM_CHANNEL_URL || "https://t.me/spacenovaxteam", type:"admin_review" },
  { id:"telegram_group", icon:"👥", title:"Join Telegram Group", reward:200, url:process.env.TELEGRAM_GROUP_URL || "https://t.me/spacesnovax", type:"admin_review" },
  { id:"youtube", icon:"▶️", title:"Subscribe on YouTube", reward:300, url:process.env.YOUTUBE_URL || "https://youtube.com/@spacenovaxteam", type:"admin_review" },
  { id:"x_follow", icon:"𝕏", title:"Follow on X", reward:300, url:process.env.X_URL || "https://x.com/spacenovaxteam", type:"admin_review" },
  { id:"discord", icon:"👾", title:"Join Discord Server", reward:300, url:process.env.DISCORD_URL || "https://discord.gg/rxVNWMC8e8", type:"admin_review" },
  { id:"bot_start", icon:"🤖", title:"Start Telegram Bot", reward:100, url:process.env.BOT_URL || "https://t.me/SpaceNovaXAdminBot", type:"instant" }
];

function phaseFor(totalMined){ return PHASES.find(p => totalMined < p.cap) || PHASES[PHASES.length-1]; }
function levelFromXp(xp){ return Math.min(20, Math.max(1, Math.floor(Number(xp||0)/1000)+1)); }
function levelBonus(level){ if(level>=20)return 1.0; if(level>=10)return .5; if(level>=5)return .2; return Math.max(0,(level-1)*.05); }
function referralBonus(referrals){ if(referrals>=500)return .5; if(referrals>=100)return .3; if(referrals>=50)return .2; if(referrals>=20)return .1; if(referrals>=5)return .05; return 0; }
function dailyReward(user, phase){ return phase.reward * (1 + levelBonus(Number(user.level||1)) + referralBonus(Number(user.referrals||0))); }

function verifyTelegramInitData(initData){
  if(!BOT_TOKEN || !initData) return {ok:false, reason:"Missing BOT_TOKEN or initData"};
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if(!hash) return {ok:false, reason:"Missing hash"};
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secretKey = crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256",secretKey).update(dataCheckString).digest("hex");
  return {ok:calculated===hash, reason:calculated===hash?"ok":"Invalid Telegram signature"};
}
function readTelegramUser(req){
  const initData = req.headers["x-telegram-init-data"] || req.body.initData || "";
  let tg = { id:"demo-user", username:"demo", first_name:"Space Explorer" };
  if(initData){
    const params = new URLSearchParams(initData);
    try { const u = JSON.parse(params.get("user") || "{}"); if(u.id) tg = u; } catch {}
  }
  return {tg, initData};
}

async function initDb(){
  if(!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      balance NUMERIC DEFAULT 0,
      xp NUMERIC DEFAULT 0,
      level INTEGER DEFAULT 1,
      referrals INTEGER DEFAULT 0,
      wallet TEXT DEFAULT '',
      mining_start BIGINT,
      last_checkin TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS xp NUMERIC DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_checkin TEXT DEFAULT '';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mission_claims (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT,
      mission_id TEXT,
      status TEXT DEFAULT 'pending',
      reward NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      reviewed_at TIMESTAMP,
      UNIQUE(telegram_id, mission_id)
    );
  `);
  await pool.query(`CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value NUMERIC DEFAULT 0);`);
  await pool.query(`INSERT INTO stats(key,value) VALUES('total_mined',0) ON CONFLICT(key) DO NOTHING`);
}
async function getTotalMined(){
  if(!pool) return memory.totalMined;
  const r = await pool.query(`SELECT value FROM stats WHERE key='total_mined'`);
  return Number(r.rows[0]?.value || 0);
}
async function addTotalMined(amount){
  if(!pool){ memory.totalMined += Number(amount); return memory.totalMined; }
  const r = await pool.query(`UPDATE stats SET value=value+$1 WHERE key='total_mined' RETURNING value`, [amount]);
  return Number(r.rows[0].value);
}
async function getOrCreateUser(tg){
  const id = String(tg.id || "demo-user");
  if(!pool){
    if(!memory.users.has(id)) memory.users.set(id,{telegram_id:id,username:tg.username||"demo",first_name:tg.first_name||"Space Explorer",balance:15250.0,xp:7850,level:7,referrals:18,wallet:"",mining_start:null,last_checkin:""});
    return memory.users.get(id);
  }
  const e = await pool.query(`SELECT * FROM users WHERE telegram_id=$1`,[id]);
  if(e.rows[0]) return e.rows[0];
  const c = await pool.query(`INSERT INTO users(telegram_id,username,first_name,balance,xp,level,referrals) VALUES($1,$2,$3,0,0,1,0) RETURNING *`,[id,tg.username||"",tg.first_name||""]);
  return c.rows[0];
}
async function saveUser(user){
  user.level = levelFromXp(user.xp || 0);
  if(!pool){ memory.users.set(String(user.telegram_id),user); return user; }
  const r = await pool.query(
    `UPDATE users SET balance=$2,xp=$3,level=$4,referrals=$5,wallet=$6,mining_start=$7,last_checkin=$8,updated_at=NOW() WHERE telegram_id=$1 RETURNING *`,
    [user.telegram_id,user.balance,user.xp||0,user.level,user.referrals,user.wallet||"",user.mining_start,user.last_checkin||""]
  );
  return r.rows[0];
}
async function completedMissionIds(telegram_id){
  if(!pool) return memory.claims.filter(c=>c.telegram_id===telegram_id && c.status==="approved").map(c=>c.mission_id);
  const r = await pool.query(`SELECT mission_id FROM mission_claims WHERE telegram_id=$1 AND status='approved'`,[telegram_id]);
  return r.rows.map(x=>x.mission_id);
}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"SpaceNovaX Premium v3",mode:pool?"postgres":"memory"}));

app.post("/api/me", async (req,res)=>{
  try{
    const {tg,initData}=readTelegramUser(req);
    if(process.env.SKIP_TELEGRAM_VERIFY!=="true" && BOT_TOKEN && initData){
      const v=verifyTelegramInitData(initData); if(!v.ok) return res.status(401).json({ok:false,error:v.reason});
    }
    const user=await getOrCreateUser(tg);
    const totalMined=await getTotalMined();
    const phase=phaseFor(totalMined);
    const done=await completedMissionIds(String(user.telegram_id));
    res.json({ok:true,user,phase,totalMined,dailyReward:dailyReward(user,phase),missions:MISSIONS,completedMissions:done,phases:PHASES});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.post("/api/mine/start", async (req,res)=>{
  try{ const {tg}=readTelegramUser(req); const user=await getOrCreateUser(tg); if(!user.mining_start){user.mining_start=Date.now(); await saveUser(user);} res.json({ok:true,user}); }
  catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post("/api/mine/claim", async (req,res)=>{
  try{
    const {tg}=readTelegramUser(req); const user=await getOrCreateUser(tg);
    if(!user.mining_start) return res.json({ok:false,error:"Mining has not started"});
    const elapsed=Date.now()-Number(user.mining_start);
    if(elapsed<86400000) return res.json({ok:false,error:"Mining session is not complete",remainingMs:86400000-elapsed});
    const total=await getTotalMined(); const phase=phaseFor(total); const reward=dailyReward(user,phase);
    user.balance=Number(user.balance)+reward; user.xp=Number(user.xp||0)+100; user.mining_start=null;
    const newTotal=await addTotalMined(reward); await saveUser(user);
    res.json({ok:true,reward,user,totalMined:newTotal,phase:phaseFor(newTotal)});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post("/api/checkin", async (req,res)=>{
  try{
    const {tg}=readTelegramUser(req); const user=await getOrCreateUser(tg);
    const today = new Date().toISOString().slice(0,10);
    if(user.last_checkin === today) return res.json({ok:false,error:"Already checked in today"});
    const reward = 20;
    user.balance = Number(user.balance)+reward; user.xp = Number(user.xp||0)+25; user.last_checkin=today;
    await saveUser(user);
    res.json({ok:true,reward,user});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post("/api/wallet", async (req,res)=>{
  try{ const {tg}=readTelegramUser(req); const user=await getOrCreateUser(tg); user.wallet=String(req.body.wallet||"").trim(); await saveUser(user); res.json({ok:true,user});}
  catch(e){res.status(500).json({ok:false,error:e.message});}
});
app.post("/api/mission/claim", async (req,res)=>{
  try{
    const {tg}=readTelegramUser(req); const user=await getOrCreateUser(tg);
    const mission = MISSIONS.find(m=>m.id===req.body.missionId);
    if(!mission) return res.status(404).json({ok:false,error:"Mission not found"});
    const id = String(user.telegram_id);
    if(!pool){
      const existing = memory.claims.find(c=>c.telegram_id===id && c.mission_id===mission.id);
      if(existing) return res.json({ok:true,status:existing.status,claim:existing});
      const claim={telegram_id:id,mission_id:mission.id,status:mission.type==="instant"?"approved":"pending",reward:mission.reward,created_at:new Date().toISOString()};
      memory.claims.push(claim);
      if(claim.status==="approved"){ user.balance=Number(user.balance)+mission.reward; user.xp=Number(user.xp||0)+50; await saveUser(user); }
      return res.json({ok:true,status:claim.status,claim,user});
    }
    const existing = await pool.query(`SELECT * FROM mission_claims WHERE telegram_id=$1 AND mission_id=$2`, [id, mission.id]);
    if(existing.rows[0]) return res.json({ok:true,status:existing.rows[0].status,claim:existing.rows[0],user});
    const status = mission.type==="instant" ? "approved" : "pending";
    const q = await pool.query(`INSERT INTO mission_claims(telegram_id,mission_id,status,reward) VALUES($1,$2,$3,$4) RETURNING *`, [id,mission.id,status,mission.reward]);
    if(status==="approved"){
      await pool.query(`UPDATE users SET balance=balance+$1, xp=xp+50 WHERE telegram_id=$2`,[mission.reward,id]);
    }
    const updated=await getOrCreateUser(tg);
    res.json({ok:true,status:q.rows[0].status,claim:q.rows[0],user:updated});
  }catch(e){res.status(500).json({ok:false,error:e.message});}
});

app.get("/api/admin/stats", async (req,res)=>{
  if(req.headers["x-admin-key"]!==ADMIN_KEY) return res.status(401).json({ok:false,error:"Access denied"});
  const totalMined=await getTotalMined();
  if(!pool){
    const users=[...memory.users.values()].sort((a,b)=>Number(b.balance)-Number(a.balance));
    return res.json({ok:true,totalUsers:users.length,totalMined,phase:phaseFor(totalMined),users,claims:memory.claims});
  }
  const count=await pool.query(`SELECT COUNT(*)::int AS count FROM users`);
  const users=await pool.query(`SELECT * FROM users ORDER BY balance DESC LIMIT 100`);
  const claims=await pool.query(`SELECT * FROM mission_claims ORDER BY created_at DESC LIMIT 100`);
  res.json({ok:true,totalUsers:count.rows[0].count,totalMined,phase:phaseFor(totalMined),users:users.rows,claims:claims.rows});
});
app.post("/api/admin/mission/review", async (req,res)=>{
  if(req.headers["x-admin-key"]!==ADMIN_KEY) return res.status(401).json({ok:false,error:"Access denied"});
  const {claimId,status}=req.body;
  if(!["approved","rejected"].includes(status)) return res.json({ok:false,error:"Invalid status"});
  if(!pool){
    const c=memory.claims[Number(claimId)];
    if(!c) return res.json({ok:false,error:"Claim not found"});
    if(c.status!=="approved" && status==="approved"){ const u=memory.users.get(c.telegram_id); if(u){u.balance=Number(u.balance)+Number(c.reward); u.xp=Number(u.xp||0)+50; memory.users.set(c.telegram_id,u);} }
    c.status=status; return res.json({ok:true,claim:c});
  }
  const before=await pool.query(`SELECT * FROM mission_claims WHERE id=$1`,[claimId]);
  if(!before.rows[0]) return res.json({ok:false,error:"Claim not found"});
  const c=before.rows[0];
  if(c.status!=="approved" && status==="approved") await pool.query(`UPDATE users SET balance=balance+$1, xp=xp+50 WHERE telegram_id=$2`,[c.reward,c.telegram_id]);
  const r=await pool.query(`UPDATE mission_claims SET status=$2, reviewed_at=NOW() WHERE id=$1 RETURNING *`,[claimId,status]);
  res.json({ok:true,claim:r.rows[0]});
});
app.post("/api/admin/user/adjust", async (req,res)=>{
  if(req.headers["x-admin-key"]!==ADMIN_KEY) return res.status(401).json({ok:false,error:"Access denied"});
  const {telegramId, amount, reason}=req.body;
  const n = Number(amount||0);
  if(!telegramId || !Number.isFinite(n)) return res.json({ok:false,error:"Invalid request"});
  if(!pool){
    const u=memory.users.get(String(telegramId)); if(!u) return res.json({ok:false,error:"User not found"});
    u.balance=Number(u.balance)+n; memory.users.set(String(telegramId),u); return res.json({ok:true,user:u});
  }
  const r=await pool.query(`UPDATE users SET balance=balance+$1 WHERE telegram_id=$2 RETURNING *`,[n,String(telegramId)]);
  res.json({ok:true,user:r.rows[0],reason});
});

initDb().then(()=>app.listen(PORT,()=>console.log(`SpaceNovaX Premium v3 running on port ${PORT}`))).catch(err=>{console.error(err);process.exit(1);});
