import assert from 'node:assert/strict';
import {simulate,validateParams,aggregate,stats,acf,scaling,crossScale,ORIGINAL_POWERS,ORIGINAL_VOL,ORIGINAL_VOLUME} from './dist/model.mjs';
import {gph,localWhittle,periodogram,defaultBandwidth} from './dist/longmemory.mjs';
import {returnsFromBars,deseasonalise,scalingExt,buildPayload,MOMENT_ORDERS} from './dist/empirical.mjs';
const normal=simulate({model:'gaussian',seed:2004,depth:12});
const uniform=simulate({lambda:0,seed:2004,depth:12});
assert.deepEqual(normal.returns,uniform.returns,'Zero-intermittency limit must exactly equal the Gaussian benchmark.');
const cascade=simulate({seed:2004,depth:12});
assert.deepEqual(cascade.returns,simulate({seed:2004,depth:12}).returns,'Seeded reproducibility');
assert.deepEqual(cascade.benchmark,normal.returns,'Gaussian shocks must be common across models');
assert.deepEqual(aggregate([1,2,3,4,5],2),[3,7],'Non-overlapping aggregation and incomplete-block handling');
assert.deepEqual(acf([1,1,1]),[{x:1,y:0},{x:2,y:0}],'Zero-variance series');
assert.equal(ORIGINAL_POWERS.length,16);assert.equal(ORIGINAL_VOLUME.length,16);assert.equal(ORIGINAL_VOL[3],.4327);assert.equal(ORIGINAL_VOLUME[15],.3688);
for(const bad of [{depth:7},{depth:10.5},{lambda:-.1},{lambda:NaN},{seed:1e9},{sigma:0},{model:'rough'},{unknown:1}])assert.throws(()=>validateParams(bad));
const gstats=stats(normal.returns);assert.ok(Math.abs(gstats.sd-1)<.07);assert.ok(Math.abs(gstats.excess)<.3);
const gs=scaling(normal.returns,2);assert.ok(Math.abs(gs.fit.slope-1)<.18,'Gaussian second-order slope should be close to one');
for(const model of ['cascade','gaussian'])for(const depth of [8,13])for(const lambda of [0,.12]){const s=simulate({model,depth,lambda,sigma:3,seed:0});assert.ok(Array.from(s.returns).every(Number.isFinite));assert.ok(Array.from(s.sigma).every(v=>Number.isFinite(v)&&v>0));assert.ok(crossScale(s.returns).every(p=>Number.isFinite(p.y)&&Math.abs(p.y)<=1+1e-12));const sc=scaling(s.returns,4);assert.ok(sc.exponents.every(p=>Number.isFinite(p.y)));for(const h of [1,5,20,64])assert.ok(Number.isFinite(stats(aggregate(s.returns,h)).excess));}

// --- long-memory estimation -------------------------------------------------
// Fractionally integrated white noise with a known d, built from truncated MA weights.
function fracNoise(n,d,seed,K=1500){let a=seed>>>0;const u=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
  let spare=null;const z=()=>{if(spare!==null){const v=spare;spare=null;return v;}const r=Math.sqrt(-2*Math.log(Math.max(u(),Number.MIN_VALUE))),th=2*Math.PI*u();spare=r*Math.sin(th);return r*Math.cos(th);};
  const psi=[1];for(let k=1;k<=K;k++)psi.push(psi[k-1]*(k-1+d)/k);
  const eps=Array.from({length:n+K},z),x=new Float64Array(n);
  for(let t=0;t<n;t++){let s=0;for(let k=0;k<=K;k++)s+=psi[k]*eps[t+K-k];x[t]=s;}return x;}

const recovered={};
for(const trueD of [0,.2,.4]){
  const runs=[0,1,2,3,4,5].map(s=>fracNoise(2633,trueD,700+s));
  const g=runs.map(x=>gph(x).d).reduce((a,b)=>a+b,0)/runs.length;
  const w=runs.map(x=>localWhittle(x).d).reduce((a,b)=>a+b,0)/runs.length;
  recovered[trueD]={gph:g,whittle:w};
  assert.ok(Math.abs(g-trueD)<.12,`GPH must recover d=${trueD}, got ${g.toFixed(3)}`);
  assert.ok(Math.abs(w-trueD)<.12,`Local Whittle must recover d=${trueD}, got ${w.toFixed(3)}`);
}
assert.ok(Math.abs(gph(Array.from(normal.returns,Math.abs)).d)<.12,'White noise must not show long memory.');
assert.equal(periodogram([1,2,3,4,5,6,7,8],3).length,3,'Periodogram must evaluate exactly the requested frequencies.');
assert.ok(periodogram(Array.from(normal.returns),8).every(p=>p.I>=0),'Periodogram ordinates are non-negative.');
assert.equal(defaultBandwidth(39312),198,'Bandwidth defaults to floor(sqrt(n)).');
assert.ok(gph(Array.from(cascade.returns,Math.abs)).se>0,'A confidence band must accompany every estimate.');

// --- bar handling and corrections -------------------------------------------
const fixtureBars=[{close:100,gap_min:null,bucket:0},{close:101,gap_min:5,bucket:1},{close:102,gap_min:5,bucket:2},
                   {close:150,gap_min:1020,bucket:0},{close:151,gap_min:5,bucket:1}];
const kept=returnsFromBars(fixtureBars,5,{dropGaps:true}),all=returnsFromBars(fixtureBars,5,{dropGaps:false});
assert.equal(kept.returns.length,3,'The overnight bar must not contribute a five-minute return.');
assert.equal(all.returns.length,4,'Without the filter the overnight return is present.');
assert.equal(kept.dropped,1,'Dropped gaps are counted even when kept.');
assert.equal(kept.buckets.length,kept.returns.length,'Buckets stay aligned with returns.');
assert.ok(Math.abs(kept.returns[0]-100*Math.log(101/100))<1e-12,'Returns are 100*log(p1/p0).');
assert.ok(Math.abs(all.returns[2]-100*Math.log(150/102))<1e-12,'The unfiltered series keeps the raw jump.');

const period=78,seasonBase=simulate({seed:7,depth:12}).returns;
const profile=i=>1+.9*Math.cos(2*Math.PI*i/period);
const seasoned=Array.from(seasonBase,(r,t)=>r*profile(t%period)),seasonBuckets=Array.from(seasonBase,(_,t)=>t%period);
const amplitude=x=>{const p=Array.from({length:period},(_,b)=>{const v=x.filter((_,i)=>seasonBuckets[i]===b);return v.reduce((s,r)=>s+Math.abs(r),0)/v.length;});return Math.max(...p)/Math.min(...p);};
assert.ok(amplitude(seasoned)>5,'The test profile must actually be seasonal.');
assert.ok(amplitude(deseasonalise(seasoned,seasonBuckets))<1.05,'Deseasonalising must flatten the time-of-day profile.');

const deep=simulate({seed:1,depth:13}).returns;
assert.ok(scalingExt(deep,2,2048).scales.at(-1)>64,'The extended structure function must pass the model.mjs ceiling of 64.');
assert.deepEqual(scalingExt(deep,2,64).scales,scaling(deep,2).scales,'At maxScale 64 it must agree with model.mjs on the scale set.');
assert.ok(Math.abs(scalingExt(normal.returns,2,2048).fit.slope-1)<.2,'Gaussian second-order slope stays near one over the wider range.');

// --- payload contract --------------------------------------------------------
const payloadBars=Array.from({length:640},(_,i)=>({close:100*Math.exp(Math.sin(i/7)/50),gap_min:i===0?null:i%80===0?1020:5,bucket:i%80}));
const payload=buildPayload(payloadBars,{symbol:'T',label:'test',resolutionMin:5,adjusted:true,kind:'fixture'});
assert.equal(payload.schema,1,'Payload carries a schema version the page can check.');
assert.deepEqual(Object.keys(payload.variants),['raw','degapped','clean'],'All three preprocessing variants are served.');
assert.equal(payload.diagnostics.gapsDropped,7,'Session boundaries are counted.');
for(const key of Object.keys(payload.variants)){const v=payload.variants[key];
  assert.equal(v.d.length,MOMENT_ORDERS.length,'d(q) covers the chapter moment orders.');
  assert.equal(v.zeta.length,MOMENT_ORDERS.length,'zeta(q) covers the same orders.');
  assert.ok(v.d.every(p=>Number.isFinite(p.y)&&Number.isFinite(p.se)),'Every estimate carries a finite standard error.');
  assert.ok(v.n>0&&Number.isFinite(v.summary.sd),'Each variant reports its own sample.');}
assert.ok(payload.variants.degapped.n<payload.variants.raw.n,'Dropping gaps must shrink the sample.');
assert.equal(payload.variants.clean.n,payload.variants.degapped.n,'Deseasonalising rescales, it does not drop observations.');

console.log(JSON.stringify({status:'passed',checks:['zero-intermittency identity','seed reproducibility','shared Gaussian shocks','aggregation','constant-series handling','historical transcription','parameter validation','Gaussian moments and scaling','parameter endpoints','long-memory recovery','estimator agreement','overnight gap handling','deseasonalisation','extended scale range','payload contract'],gaussian:gstats,defaultCascade:stats(cascade.returns),gaussianSecondOrderSlope:gs.fit.slope,longMemoryRecovery:recovered},null,2));
