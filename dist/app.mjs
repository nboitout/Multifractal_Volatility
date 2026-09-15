import {DEFAULTS,validateParams,simulate,stats,aggregate,acf,crossScale,scaling,partialSigma,ORIGINAL_POWERS,ORIGINAL_VOL,ORIGINAL_VOLUME} from './model.mjs';
const $=id=>document.getElementById(id);
const BLUE='#245ad6',GRAY='#98a5b9',TEAL='#087c80';
// A diverging ramp for the cascade view: a multiplier either damps or amplifies, and
// W = 1 is a real midpoint rather than a low end, so one hue either side of a neutral.
const RAMP=['#6f4206','#b8802f','#e8d3b4','#f1f4f9','#c2d2f1','#4276dd','#123a93'];
let params={...DEFAULTS},activeTab='cascade',logDensity=false,simulation=null,analysis=null,lastSimulationKey='',pending=0;
const ARGUMENT={
  flow:{steps:[1],note:'Step 1 — the assumption the rest of the chapter rests on.'},
  returns:{steps:[1],note:'Step 1, continued — the first consequence of letting information intensity vary.'},
  memory:{steps:[2,3],note:'Steps 2 and 3 — persistence, and how it changes with the power measured and across scales.'},
  scaling:{steps:[4],note:'Step 4 — behaviour that changes with the observation horizon.'},
  cascade:{steps:[4],note:'Step 4, from the generator’s side — the construction the controls act on.'},
  chapter:{steps:[],note:'Evidence — the original Alcatel results, exactly as reported.'}};
const pretty=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const short=n=>Math.abs(n)>=1000?Number(n).toLocaleString('en-US',{maximumFractionDigits:0}):Math.abs(n)>=10?pretty(n,1):Math.abs(n)>=.01||n===0?pretty(n,2):n.toExponential(1);
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const points=x=>Array.from(x,(y,i)=>({x:i+1,y}));
function envelope(data,max=1300){if(data.length<=max)return data;const result=[];const block=Math.ceil(data.length/(max/2));for(let i=0;i<data.length;i+=block){const slice=data.slice(i,i+block);const lo=slice.reduce((a,b)=>a.y<b.y?a:b),hi=slice.reduce((a,b)=>a.y>b.y?a:b);result.push(...(lo.x<hi.x?[lo,hi]:[hi,lo]));}return result;}
function chart(id,series,opts={}){
  const el=$(id),width=Math.max(el.clientWidth||650,240),height=el.clientHeight||280,left=width<450?52:63,right=18,top=18,bottom=50,pw=width-left-right,ph=height-top-bottom;
  const all=series.flatMap(s=>s.data).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(!all.length){el.innerHTML='<p class="chart-note">Not enough observations to estimate this quantity.</p>';return;}
  let xmin=opts.xmin??Math.min(...all.map(p=>p.x)),xmax=opts.xmax??Math.max(...all.map(p=>p.x));
  let ymin=opts.ymin??Math.min(...all.map(p=>p.y)),ymax=opts.ymax??Math.max(...all.map(p=>p.y));
  if(xmin===xmax){xmin-=.5;xmax+=.5;}if(ymin===ymax){const pad=Math.max(.1,Math.abs(ymin)*.1);ymin-=pad;ymax+=pad;}
  if(opts.ymin===undefined){const pad=(ymax-ymin)*.09;ymin-=pad;ymax+=pad;}else if(opts.ymax===undefined)ymax+=(ymax-ymin)*.1;
  const X=x=>left+(x-xmin)/(xmax-xmin)*pw,Y=y=>top+(ymax-y)/(ymax-ymin)*ph;
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(opts.label||'Data chart')}"><title>${escape(opts.label||'Data chart')}</title>`;
  const yfmt=opts.yformat||short,xfmt=opts.xformat||short;
  for(let j=0;j<=4;j++){const v=ymin+(ymax-ymin)*j/4,y=Y(v);svg+=`<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="#e8edf4"/><text x="${left-10}" y="${y+4}" text-anchor="end" fill="#64748b" font-size="12" font-family="system-ui">${escape(yfmt(v))}</text>`;}
  const xticks=opts.xticks||Array.from({length:width<450?4:6},(_,i)=>xmin+(xmax-xmin)*i/(width<450?3:5));
  for(const v of xticks){const x=X(v);svg+=`<text x="${x}" y="${height-28}" text-anchor="middle" fill="#64748b" font-size="12" font-family="system-ui">${escape(xfmt(v))}</text>`;}
  if(ymin<0&&ymax>0)svg+=`<line x1="${left}" y1="${Y(0)}" x2="${width-right}" y2="${Y(0)}" stroke="#b9c7d9" stroke-dasharray="3 4"/>`;
  for(const s of series){const data=envelope(s.data).filter(p=>Number.isFinite(p.y)&&Number.isFinite(p.x));
    if(s.bars){for(const p of data){const x0=X(p.x-s.binWidth/2),x1=X(p.x+s.binWidth/2),y=Y(p.y);svg+=`<rect x="${x0+.5}" y="${y}" width="${Math.max(.1,x1-x0-1)}" height="${Math.max(0,Y(ymin)-y)}" fill="${s.color||BLUE}" opacity=".78"/>`;}}
    else{const path=data.map((p,i)=>`${i?'L':'M'}${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`).join('');if(s.fill&&data.length)svg+=`<path d="${path} L${X(data.at(-1).x)},${Y(ymin)} L${X(data[0].x)},${Y(ymin)} Z" fill="${s.color||BLUE}" opacity=".08"/>`;svg+=`<path d="${path}" fill="none" stroke="${s.color||BLUE}" stroke-width="${s.stroke||1.8}" ${s.dash?'stroke-dasharray="5 5"':''} stroke-linejoin="round"/>`;if(s.dots)for(const p of data)svg+=`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3" fill="${s.color||BLUE}"/>`;}
  }
  svg+=`<text x="${left}" y="11" fill="#64748b" font-size="12" font-family="system-ui">${escape(opts.ylabel||'')}</text><text x="${left+pw/2}" y="${height-5}" text-anchor="middle" fill="#64748b" font-size="12" font-family="system-ui">${escape(opts.xlabel||'')}</text></svg><div class="chart-tooltip" hidden></div>`;
  el.innerHTML=svg;
  const tooltip=el.querySelector('.chart-tooltip');
  el.onpointermove=e=>{const rect=el.getBoundingClientRect(),position=(e.clientX-rect.left)/rect.width*width;if(position<left||position>width-right){tooltip.hidden=true;return;}const target=xmin+(position-left)/pw*(xmax-xmin);const main=series.find(s=>!s.reference)||series[0];const point=main.data.reduce((a,b)=>Math.abs(a.x-target)<Math.abs(b.x-target)?a:b);tooltip.textContent=(main.name?main.name+' · ':'')+xfmt(point.x)+' : '+yfmt(point.y);tooltip.hidden=false;};
  el.onpointerleave=()=>{tooltip.hidden=true;};
}
function distribution(){
  const x=aggregate(simulation.returns,params.horizon),s=stats(x),bins=Math.max(6,Math.min(60,Math.round(Math.sqrt(x.length)))),range=(s.max-s.min)||1,lo=s.min-range*.025,hi=s.max+range*.025,dx=(hi-lo)/bins,counts=Array(bins).fill(0);
  for(const value of x)counts[Math.min(bins-1,Math.max(0,Math.floor((value-lo)/dx)))]++;
  const histogram=counts.map((c,i)=>({x:lo+(i+.5)*dx,y:c/x.length/dx}));
  const gaussian=Array.from({length:241},(_,i)=>{const v=lo+(hi-lo)*i/240;return {x:v,y:Math.exp(-.5*((v-s.mean)/s.sd)**2)/(s.sd*Math.sqrt(2*Math.PI))};});
  const floor=Math.max(...histogram.map(p=>p.y),...gaussian.map(p=>p.y))*1e-5;
  const plottedHist=logDensity?histogram.filter(p=>p.y>0).map(p=>({...p,y:Math.log10(p.y)})):histogram;
  const plottedGauss=logDensity?gaussian.filter(p=>p.y>=floor).map(p=>({...p,y:Math.log10(p.y)})):gaussian;
  chart('distribution-chart',[{data:plottedHist,bars:true,binWidth:dx,name:'Density'},{data:plottedGauss,color:GRAY,stroke:2.2,reference:true}],{xmin:lo,xmax:hi,ymin:logDensity?Math.log10(floor):0,ylabel:logDensity?'Density · logarithmic axis':'Probability density',xlabel:`${params.horizon}-observation log return (%)`,label:'Histogram of simulated aggregated log returns with a Gaussian density matching the sample mean and variance',yformat:logDensity?v=>(10**v).toExponential(0):short});
  $('metrics').innerHTML=[['Standard deviation',pretty(s.sd)+'%','Selected return horizon'],['Excess kurtosis',pretty(s.excess),'Gaussian reference: 0'],['Beyond 3σ',pretty(s.tail*100)+'%','Gaussian reference: 0.27%'],['Sample size',s.n.toLocaleString('en-US'),'Aggregated observations']].map(([label,value,note])=>`<div class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-note">${note}</p></div>`).join('');
  $('distribution-note').innerHTML=`${x.length<50?'<strong>Small sample: only '+x.length+' aggregated returns. Tail statistics and histogram shape are unstable.</strong> ':''}Sample mean ${pretty(s.mean,3)}%; skewness ${pretty(s.skew)}. ${logDensity?'Empty histogram bins are omitted on the logarithmic axis. ':''}The full observed range is shown; the Gaussian curve is a distributional reference, not a second simulation.`;
  chart('returns-chart',[{data:points(simulation.returns),color:BLUE,stroke:1}],{xlabel:'Observation',ylabel:'Return (%)',label:'Simulated one-observation returns over time',xformat:v=>Math.round(v).toLocaleString('en-US')});
  return s;
}
function memory(){const absolute=Array.from(simulation.returns,r=>Math.abs(r)**params.power);$('power-legend').textContent='|r|^'+pretty(params.power);chart('acf-chart',[{data:acf(absolute),name:'|r|^'+pretty(params.power)},{data:acf(simulation.returns),color:GRAY,reference:true}],{xlabel:'Lag (observations)',ylabel:'Correlation',xmin:1,xmax:64,ymin:-.2,ymax:1,label:'Autocorrelation of power-transformed absolute returns and signed returns',xformat:v=>String(Math.round(v))});chart('cross-chart',[{data:crossScale(simulation.returns),color:TEAL,name:'Coarse → fine'}],{xlabel:'Lag (observations) · positive = coarse leads fine',ylabel:'Correlation',xmin:-20,xmax:20,ymin:-1,ymax:1,label:'Lagged sample correlation between coarse and fine volatility',xformat:v=>String(Math.round(v))});}
function multiscaling(){analysis=scaling(simulation.returns,params.power);$('structure-title').textContent='Moment q = '+pretty(params.power);$('fit-summary').textContent='ζ(q) = '+pretty(analysis.fit.slope,3)+' · R² = '+pretty(analysis.fit.r2,3);chart('structure-chart',[{data:analysis.points,dots:true,name:'log₂ S(q)'},{data:analysis.points.map(p=>({x:p.x,y:analysis.fit.intercept+analysis.fit.slope*p.x})),color:GRAY,dash:true,reference:true}],{xlabel:'Horizon k (log₂ spacing)',ylabel:'log₂ S(q)',xticks:analysis.points.map(p=>p.x),xformat:v=>String(2**v),label:'Log-log structure function and fitted regression for the selected moment order'});chart('scaling-chart',[{data:analysis.exponents,dots:true,name:'Estimated ζ(q)'},{data:[{x:0,y:0},{x:4,y:2}],color:GRAY,dash:true,reference:true}],{xlabel:'Moment order q',ylabel:'Scaling exponent ζ(q)',xmin:0,xmax:4,xticks:[0,1,2,3,4],label:'Estimated scaling exponents across moment orders compared with the Gaussian q over two reference'});}
function historical(){chart('original-chart',[{data:ORIGINAL_POWERS.map((x,i)=>({x,y:ORIGINAL_VOL[i]})),dots:true,name:'Volatility d'},{data:ORIGINAL_POWERS.map((x,i)=>({x,y:ORIGINAL_VOLUME[i]})),color:TEAL,dots:true,name:'Volume d'}],{xlabel:'Power q',ylabel:'Reported fractional-dependence estimate d̂',xmin:0,xmax:4,ymin:0,ymax:.5,xticks:[0,1,2,3,4],label:'Original chapter Table 1.4: reported persistence estimates for power transformations of volatility and volume'});$('original-table').innerHTML=ORIGINAL_POWERS.map((q,i)=>`<tr><td>${pretty(q)}</td><td>${pretty(ORIGINAL_VOL[i],4)}</td><td>${pretty(ORIGINAL_VOLUME[i],4)}</td></tr>`).join('');}
function flow(){
  // simulate() already returns the benchmark built from the same Gaussian draws, so the
  // two series here differ in K alone. verify.mjs asserts that the shocks are shared.
  const varying=stats(simulation.returns),constant=stats(simulation.benchmark);
  const identical=params.model==='gaussian'||params.lambda===0;
  $('flow-metrics').innerHTML=[
    ['Excess kurtosis, K constant',pretty(constant.excess),'Gaussian reference: 0'],
    ['Excess kurtosis, K varying',pretty(varying.excess),'Identical shocks and seed'],
    ['Beyond 3σ, K constant',pretty(constant.tail*100)+'%','Gaussian reference: 0.27%'],
    ['Beyond 3σ, K varying',pretty(varying.tail*100)+'%','Identical shocks and seed'],
  ].map(([label,value,note])=>`<div class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-note">${note}</p></div>`).join('');
  chart('flow-intensity-chart',[{data:points(Array.from(simulation.sigma,v=>v*v)),color:TEAL,fill:true,stroke:1.4}],
    {xlabel:'Observation',ylabel:'Information intensity K',ymin:0,label:'Latent information intensity generated by the selected model',xformat:v=>Math.round(v).toLocaleString('en-US')});
  chart('flow-compare-chart',[
    {data:points(simulation.returns),color:BLUE,stroke:1,name:'√K Z'},
    {data:points(simulation.benchmark),color:GRAY,stroke:1,reference:true},
  ],{xlabel:'Observation',ylabel:'Return (%)',label:'The same Gaussian shocks with varying and with constant information intensity',xformat:v=>Math.round(v).toLocaleString('en-US')});
  $('flow-compare-tag').textContent=identical?'the two series coincide':'seed '+params.seed;
  $('flow-compare-note').innerHTML=identical
    ?'Information intensity is constant in this configuration, so the two lines are the same series. Raise the intermittency, or set the return process to the lognormal cascade, to separate them.'
    :`Both lines use the same Gaussian draws Z<sub>t</sub> from seed ${params.seed}. Only K<sub>t</sub> differs. Where the blue line is larger the shocks are not larger; more information arrived. That alone lifts excess kurtosis from ${pretty(constant.excess)} to ${pretty(varying.excess)} without altering the distribution of Z<sub>t</sub>.`;
}
// ---- The cascade view -------------------------------------------------------------
// The tree is a canvas because at depth 13 it is 16,382 cells; everything around it —
// row labels, ticks, the branch panel — stays in the document so it keeps the page's
// type and can be read out. The full-depth path is recomputed from the levels rather
// than taken from simulation.sigma, so the view still shows the construction when the
// return process is set to the Gaussian benchmark, which discards it.
const ROW_HEIGHT=20,ROW_GAP=2,SIGMA_HEIGHT=96;
let hoverIndex=null,appliedSigma=null,fullSigma=null;
function mixHex(from,to,fraction){const parse=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),a=parse(from),b=parse(to);return 'rgb('+a.map((v,i)=>Math.round(v+(b[i]-v)*fraction)).join(',')+')';}
function ramp(position){const u=(Math.max(-1,Math.min(1,position))+1)/2*(RAMP.length-1),i=Math.min(RAMP.length-2,Math.floor(u));return mixHex(RAMP[i],RAMP[i+1],u-i);}
function surface(canvas,height){
  const ratio=Math.min(window.devicePixelRatio||1,2),width=Math.max(1,Math.round(canvas.parentElement.clientWidth));
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.height=height+'px';
  const context=canvas.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
  return {context,width,height};
}
function horizonName(observations){
  if(observations===1)return '1 day';
  if(observations<5)return observations+' days';
  if(observations<21)return Math.round(observations/5)+' wk';
  if(observations<252)return Math.round(observations/21)+' mo';
  const years=observations/252;
  return (years<4?years.toFixed(1).replace(/\.0$/,''):Math.round(years))+' yr';
}
function ladder(){
  const depth=params.depth,spread=2*Math.sqrt(params.lambda*Math.LN2);
  const {context,width}=surface($('cascade-canvas'),depth*ROW_HEIGHT+(depth-1)*ROW_GAP);
  for(let level=1;level<=depth;level++){
    const drawn=simulation.levels[level-1],blocks=2**level,y=(level-1)*(ROW_HEIGHT+ROW_GAP);
    context.globalAlpha=level>params.applied?.2:1;
    if(blocks<=width){
      const block=width/blocks;
      for(let b=0;b<blocks;b++){context.fillStyle=ramp(spread?drawn[b]/spread:0);context.fillRect(b*block,y,Math.max(1,block-(block>3?1:0)),ROW_HEIGHT);}
    }else for(let x=0;x<width;x++){context.fillStyle=ramp(spread?drawn[Math.min(blocks-1,Math.floor(x/width*blocks))]/spread:0);context.fillRect(x,y,1,ROW_HEIGHT);}
  }
  context.globalAlpha=1;
  $('cascade-rows').innerHTML=Array.from({length:depth},(_,i)=>{
    const level=i+1,observations=2**(depth-level);
    return `<div class="ladder-row${level>params.applied?' spent':''}" style="height:${ROW_HEIGHT}px;margin-bottom:${level<depth?ROW_GAP:0}px"><span>${horizonName(observations)}</span><span class="ladder-obs">${observations.toLocaleString('en-US')}</span></div>`;
  }).join('');
  $('cascade-axis').innerHTML=[0,.25,.5,.75,1].map(f=>`<span>${Math.round(f*simulation.n).toLocaleString('en-US')}</span>`).join('');
  $('cascade-unit').textContent=`J = ${depth} levels · ${(2**(depth+1)-2).toLocaleString('en-US')} multipliers`;
  $('cascade-ramp').style.background='linear-gradient(90deg,'+Array.from({length:11},(_,i)=>ramp(-1+i/5)).join(',')+')';
  $('cascade-ramp-lo').textContent=spread?'W ≈ '+pretty(Math.exp(-spread)):'damping';
  $('cascade-ramp-hi').textContent=spread?'W ≈ '+pretty(Math.exp(spread)):'amplifying';
}
function volatilityPath(){
  const {context,width,height}=surface($('cascade-sigma-canvas'),SIGMA_HEIGHT),n=simulation.n,pad=7;
  let top=0;for(let t=0;t<n;t++){if(fullSigma[t]>top)top=fullSigma[t];if(appliedSigma[t]>top)top=appliedSigma[t];}
  if(!(top>0))top=1;
  const Y=value=>height-pad-(value/top)*(height-2*pad);
  const envelope=series=>{
    const out=new Float64Array(width);
    for(let x=0;x<width;x++){const from=Math.floor(x/width*n),to=Math.max(from+1,Math.floor((x+1)/width*n));let peak=0;for(let t=from;t<to&&t<n;t++)if(series[t]>peak)peak=series[t];out[x]=peak;}
    return out;
  };
  const reference=envelope(fullSigma),drawn=envelope(appliedSigma);
  context.strokeStyle='#e8edf4';context.lineWidth=1;
  for(const fraction of [.5,1]){const y=Math.round(Y(top*fraction))+.5;context.beginPath();context.moveTo(0,y);context.lineTo(width,y);context.stroke();}
  const trace=(series,color,lineWidth)=>{context.strokeStyle=color;context.lineWidth=lineWidth;context.beginPath();for(let x=0;x<width;x++){const y=Y(series[x]);x?context.lineTo(x,y):context.moveTo(x,y);}context.stroke();};
  trace(reference,GRAY,1);
  context.fillStyle='#245ad61f';context.beginPath();context.moveTo(0,height);
  for(let x=0;x<width;x++)context.lineTo(x,Y(drawn[x]));
  context.lineTo(width,height);context.closePath();context.fill();
  trace(drawn,BLUE,1.4);
  context.fillStyle='#64748b';context.font='12px system-ui, sans-serif';context.fillText(pretty(top)+'%',4,13);
}
function branch(){
  const n=simulation.n,depth=params.depth,spread=2*Math.sqrt(params.lambda*Math.LN2);
  let index=hoverIndex===null?null:Math.min(hoverIndex,n-1);
  const resting=index===null;
  if(resting){index=0;for(let t=1;t<n;t++)if(fullSigma[t]>fullSigma[index])index=t;}
  let below=0;for(let t=0;t<n;t++)if(fullSigma[t]<fullSigma[index])below++;
  const share=below/(n-1);
  $('cascade-instant').textContent='Observation '+(index+1).toLocaleString('en-US')+(resting?' · the most turbulent instant in this draw':'');
  $('cascade-sigma-value').textContent='σ = '+pretty(fullSigma[index],3)+'%';
  $('cascade-rank').textContent=share>=.9995?'the largest σ in this draw':share<=.0005?'the smallest σ in this draw':'larger than '+pretty(share*100,1)+'% of the sample';
  let product=params.sigma;
  $('cascade-branch').innerHTML=Array.from({length:depth},(_,i)=>{
    const level=i+1,observations=2**(depth-level),logW=simulation.levels[level-1][Math.floor(index/observations)],multiplier=Math.exp(logW);
    if(level<=params.applied)product*=multiplier;
    const offset=spread?Math.max(-1,Math.min(1,logW/spread)):0,extent=Math.abs(offset)*50;
    return `<div class="branch-row${level>params.applied?' spent':''}"><span>${observations.toLocaleString('en-US')}</span><span class="branch-track"><span class="branch-bar" style="background:${ramp(offset)};${offset<0?'right':'left'}:50%;width:${extent}%"></span></span><span class="branch-w">${pretty(multiplier,3)}</span></div>`;
  }).join('');
  $('cascade-foot').innerHTML=`σ₀ ${pretty(params.sigma)}% × ${params.applied} multiplier${params.applied===1?'':'s'} = <strong>${pretty(product,3)}%</strong>. The left column is the block width in observations. A bar runs left of centre where that horizon damps and right where it amplifies.`;
}
function crosshair(){
  for(const [plot,cross] of [['cascade-plot','cascade-cross'],['cascade-sigma-plot','cascade-sigma-cross']]){
    const line=$(cross);
    if(hoverIndex===null){line.hidden=true;continue;}
    line.hidden=false;line.style.left=((Math.min(hoverIndex,simulation.n-1)+.5)/simulation.n*$(plot).clientWidth)+'px';
  }
}
function cascade(){
  appliedSigma=partialSigma(simulation,params.applied,params.sigma);
  fullSigma=partialSigma(simulation,params.depth,params.sigma);
  const partial=Float64Array.from(appliedSigma,(v,t)=>v*simulation.shocks[t]);
  const sorted=Float64Array.from(appliedSigma).sort();
  $('cascade-metrics').innerHTML=[
    ['Levels applied',params.applied+' / '+params.depth,params.applied?'coarsest '+params.applied+' of '+params.depth+' levels':'σ₀ alone — no multipliers'],
    ['Finest horizon resolved',(2**(params.depth-params.applied)).toLocaleString('en-US'),'block width, observations'],
    ['Excess kurtosis',pretty(stats(partial).excess),'returns at this many levels'],
    ['Peak σ / median σ',pretty(sorted[sorted.length-1]/sorted[sorted.length>>1],1)+'×','how uneven this draw is'],
  ].map(([label,value,note])=>`<div class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-note">${note}</p></div>`).join('');
  const benchmark=params.model==='gaussian';
  $('cascade-model-note').hidden=!benchmark;
  if(benchmark)$('cascade-model-note').innerHTML='The return process is set to the Gaussian benchmark, which draws these multipliers and then discards them: its volatility is σ₀ at every horizon. The tree below is the cascade the same seed would build, and the statistics in this view are its, not the benchmark’s. Switch the return process to the lognormal cascade to make the other views use it.';
  ladder();volatilityPath();branch();crosshair();
}
function syncControls(){for(const k of Object.keys(DEFAULTS)){if($(k).value!==String(params[k]))$(k).value=String(params[k]);}for(const k of ['lambda','depth','applied','sigma','power'])$(k+'-value').textContent=k==='lambda'?pretty(params[k],3):k==='sigma'?pretty(params[k])+'%':k==='depth'||k==='applied'?String(params[k]):pretty(params[k]);$('applied').max=String(params.depth);const simulationActive=activeTab!=='chapter';$('controls-inactive').hidden=simulationActive;const argument=ARGUMENT[activeTab]??{steps:[],note:''};for(const item of $('argument').children)item.classList.toggle('active',argument.steps.includes(Number(item.dataset.step)));$('argument-note').textContent=argument.note;for(const key of Object.keys(DEFAULTS))$(key).disabled=!simulationActive||(key==='lambda'&&params.model==='gaussian');$('new-seed').disabled=$('reset').disabled=!simulationActive;$('sample-help').textContent=(2**params.depth).toLocaleString('en-US')+' simulated observations · 2^'+params.depth;$('model-help').textContent=params.model==='cascade'?'Gaussian shocks multiplied by a volatility cascade.':'Independent Gaussian returns with constant volatility.';$('formula').innerHTML=params.model==='cascade'?'r<sub>t</sub> = σ<sub>t</sub> Z<sub>t</sub><br><span>σ<sub>t</sub> = σ₀ ∏ W<sub>j,t</sub></span>':'r<sub>t</sub> = σ₀ Z<sub>t</sub><br><span>Z<sub>t</sub> ∼ N(0, 1)</span>';const state=activeTab==='chapter'?'historical':'simulated';$('experiment-summary').textContent=state==='historical'?'Alcatel · 1991–2001 · reported values':(params.model==='cascade'?'Lognormal cascade':'Gaussian benchmark')+' · '+(2**params.depth).toLocaleString('en-US')+' observations · seed '+params.seed;$('data-tag').textContent={historical:'ORIGINAL RESULTS',simulated:'SIMULATED DATA'}[state];$('data-tag').classList.toggle('historical',state==='historical');}
function render(){syncControls();const key=JSON.stringify([params.model,params.lambda,params.depth,params.sigma,params.seed]);if(key!==lastSimulationKey){simulation=simulate(params);lastSimulationKey=key;}if(activeTab==='flow')flow();else if(activeTab==='returns')distribution();else if(activeTab==='memory')memory();else if(activeTab==='scaling')multiscaling();else if(activeTab==='cascade')cascade();else historical();$('live-status').textContent='Updated '+activeTab+' view. '+(activeTab==='chapter'?'Reported values from the original table.':(2**params.depth)+' observations, seed '+params.seed+'.');}
function update(input){const candidate=validateParams({...params,...input});params=candidate;clearTimeout(pending);$('error').hidden=true;render();return {parameters:{...params},view:activeTab,statistics:stats(aggregate(simulation.returns,params.horizon))};}
function setTab(tab){if(!['flow','returns','memory','scaling','cascade','chapter'].includes(tab))throw Error('Unknown view.');activeTab=tab;for(const t of document.querySelectorAll('[role=tab]')){const selected=t.dataset.tab===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;$('panel-'+t.dataset.tab).hidden=!selected;}render();}
for(const k of Object.keys(DEFAULTS))$(k).addEventListener(k==='seed'?'change':'input',()=>{try{const raw=$(k).value;if(raw.trim()==='')throw Error('Enter a seed between 0 and 999999.');const value=k==='model'?raw:Number(raw);update(k==='depth'?{depth:value,applied:value}:{[k]:value});}catch(error){$('error').textContent=error.message;$('error').hidden=false;}});
$('new-seed').addEventListener('click',()=>{const draw=new Uint32Array(1);crypto.getRandomValues(draw);update({seed:draw[0]%1000000});});
$('reset').addEventListener('click',()=>{logDensity=false;$('log-density').checked=false;update({...DEFAULTS});});
$('log-density').addEventListener('change',()=>{logDensity=$('log-density').checked;distribution();});
for(const tab of document.querySelectorAll('[role=tab]')){tab.addEventListener('click',()=>setTab(tab.dataset.tab));tab.addEventListener('keydown',e=>{const all=[...document.querySelectorAll('[role=tab]')],i=all.indexOf(tab);let index;if(e.key==='ArrowRight')index=(i+1)%all.length;else if(e.key==='ArrowLeft')index=(i+all.length-1)%all.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=all.length-1;else return;e.preventDefault();all[index].focus();setTab(all[index].dataset.tab);});}
for(const id of ['cascade-plot','cascade-sigma-plot']){
  const plot=$(id);
  plot.addEventListener('pointermove',event=>{const box=plot.getBoundingClientRect();hoverIndex=Math.max(0,Math.min(simulation.n-1,Math.floor((event.clientX-box.left)/box.width*simulation.n)));branch();crosshair();});
  plot.addEventListener('pointerleave',()=>{hoverIndex=null;branch();crosshair();});
}
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
render();
// Structured access uses the same validation and state transitions as the UI.
const context=document.modelContext;
if(context?.registerTool){const lifecycle=new AbortController();const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'configure_volatility_experiment',title:'Configure volatility experiment',description:'Set simulation parameters and update the visible experiment. Returns sample statistics; does not export data.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{model:{type:'string',enum:['cascade','gaussian']},lambda:{type:'number',minimum:0,maximum:.12,multipleOf:.005},depth:{type:'integer',minimum:8,maximum:13},applied:{type:'integer',minimum:0,maximum:13},sigma:{type:'number',minimum:.25,maximum:3,multipleOf:.25},horizon:{type:'integer',enum:[1,5,20,64]},power:{type:'number',minimum:.25,maximum:4,multipleOf:.25},seed:{type:'integer',minimum:0,maximum:999999}},additionalProperties:false},execute(input){if(input?.horizon!==undefined&&![1,5,20,64].includes(input.horizon))throw Error('Choose horizon 1, 5, 20 or 64.');if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected parameter object.');for(const k of Object.keys(input))if(!(k in DEFAULTS))throw Error('Unknown parameter: '+k);return update(input);}});
  register({name:'show_volatility_analysis',title:'Show volatility analysis',description:'Switch to returns, memory, scaling, the cascade construction, or the original chapter results.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{view:{type:'string',enum:['returns','memory','scaling','cascade','chapter']}},required:['view'],additionalProperties:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='view'))throw Error('Expected a view.');setTab(input.view);return {view:activeTab,parameters:{...params}};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
