const SPORTS={NBA:'basketball_nba',NFL:'americanfootball_nfl',NHL:'icehockey_nhl'};
const BOOKS=['FanDuel','DraftKings','BetMGM','Caesars'];
const pending=new Map();
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
async function odds(request,env,ctx){
 const sport=new URL(request.url).searchParams.get('sport')||'NBA';
 if(!SPORTS[sport])return json({error:'Unsupported sport.'},400);
 if(!env.ODDS_API_KEY)return json({error:'The odds feed is not configured.'},503);
 let cache;try{cache=await globalThis.caches?.open('line-lab-odds-v1')}catch{}
 const cacheKey=new Request(new URL('/__odds_cache_v1/'+sport,request.url));
 if(cache){const hit=await cache.match(cacheKey);if(hit)return json(await hit.json());}
 if(pending.has(sport))return json(await pending.get(sport));
 const job=(async()=>{
 const url=new URL('https://api.the-odds-api.com/v4/sports/'+SPORTS[sport]+'/odds');
 url.search=new URLSearchParams({apiKey:env.ODDS_API_KEY,regions:'us',markets:'spreads',oddsFormat:'american'});
 let response;try{response=await fetch(url,{signal:AbortSignal.timeout(15000)})}catch{return {error:'The odds provider could not be reached. Please try again.'}}
 if(!response.ok)return {error:response.status===401?'The odds provider rejected the API key.':response.status===429?'The odds provider quota or rate limit has been reached.':'The odds provider returned an error ('+response.status+').'};
 let events;try{events=await response.json()}catch{return {error:'The odds provider returned an invalid response.'}}
 if(!Array.isArray(events))return {error:'The odds provider returned an unexpected response.'};
 const data={fetchedAt:new Date().toISOString(),remaining:response.headers.get('x-requests-remaining'),books:BOOKS,events:events.map(e=>({id:e.id,home:e.home_team,away:e.away_team,starts:e.commence_time,quotes:(e.bookmakers||[]).filter(b=>BOOKS.includes(b.title)).flatMap(b=>{let m=(b.markets||[]).find(m=>m.key==='spreads'),q=m?.outcomes?.find(o=>o.name===e.home_team);return q&&Number.isFinite(q.point)&&Number.isFinite(q.price)?[{book:b.title,point:q.point,price:q.price,updated:m.last_update||b.last_update}]:[]})})).filter(e=>e.quotes.length).sort((a,b)=>a.starts.localeCompare(b.starts))};
 if(cache){const saved=new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=900'}});ctx.waitUntil(cache.put(cacheKey,saved));}
 return data;
 })();pending.set(sport,job);try{const data=await job;return json(data,data.error?502:200)}finally{pending.delete(sport)}
}
export default {async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(request.method!=='GET')return json({error:'Method not allowed.'},405);if(path==='/api/odds')return odds(request,env,ctx);if(path==='/'||path==='/index.html')return new Response(HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});return new Response('Not found',{status:404})}};
