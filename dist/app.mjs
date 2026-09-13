import {DEFAULTS,validateParams,simulate,stats,aggregate,acf,crossScale,scaling,ORIGINAL_POWERS,ORIGINAL_VOL,ORIGINAL_VOLUME} from './model.mjs';
const $=id=>document.getElementById(id);
const BLUE='#245ad6',GRAY='#98a5b9',TEAL='#087c80',PURPLE='#6b46c1';
let params={...DEFAULTS},activeTab='returns',logDensity=false,simulation=null,analysis=null,lastSimulationKey='',pending=0;
// Measured series are precomputed offline by scripts/derive.mjs and served as static
// JSON. The browser never estimates them, so the deployment stays static and the
// research store stays off the interactive path.
let manifest=null,curves=null,curvesFor='',dataState='idle',dataMessage='',measuredVariant='clean';
const VARIANT_LABELS={raw:'no corrections applied',degapped:'overnight and weekend returns dropped',clean:'gaps dropped and deseasonalised'};
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
  chart('volatility-chart',[{data:points(simulation.sigma),color:TEAL,fill:true,stroke:1.4}],{xlabel:'Observation',ylabel:'Conditional volatility (%)',ymin:0,label:'Latent volatility generated by the selected model',xformat:v=>Math.round(v).toLocaleString('en-US')});
  return s;
}
function memory(){const absolute=Array.from(simulation.returns,r=>Math.abs(r)**params.power);$('power-legend').textContent='|r|^'+pretty(params.power);chart('acf-chart',[{data:acf(absolute),name:'|r|^'+pretty(params.power)},{data:acf(simulation.returns),color:GRAY,reference:true}],{xlabel:'Lag (observations)',ylabel:'Correlation',xmin:1,xmax:64,ymin:-.2,ymax:1,label:'Autocorrelation of power-transformed absolute returns and signed returns',xformat:v=>String(Math.round(v))});chart('cross-chart',[{data:crossScale(simulation.returns),color:TEAL,name:'Coarse → fine'}],{xlabel:'Lag (observations) · positive = coarse leads fine',ylabel:'Correlation',xmin:-20,xmax:20,ymin:-1,ymax:1,label:'Lagged sample correlation between coarse and fine volatility',xformat:v=>String(Math.round(v))});}
function multiscaling(){analysis=scaling(simulation.returns,params.power);$('structure-title').textContent='Moment q = '+pretty(params.power);$('fit-summary').textContent='ζ(q) = '+pretty(analysis.fit.slope,3)+' · R² = '+pretty(analysis.fit.r2,3);chart('structure-chart',[{data:analysis.points,dots:true,name:'log₂ S(q)'},{data:analysis.points.map(p=>({x:p.x,y:analysis.fit.intercept+analysis.fit.slope*p.x})),color:GRAY,dash:true,reference:true}],{xlabel:'Horizon k (log₂ spacing)',ylabel:'log₂ S(q)',xticks:analysis.points.map(p=>p.x),xformat:v=>String(2**v),label:'Log-log structure function and fitted regression for the selected moment order'});chart('scaling-chart',[{data:analysis.exponents,dots:true,name:'Estimated ζ(q)'},{data:[{x:0,y:0},{x:4,y:2}],color:GRAY,dash:true,reference:true}],{xlabel:'Moment order q',ylabel:'Scaling exponent ζ(q)',xmin:0,xmax:4,xticks:[0,1,2,3,4],label:'Estimated scaling exponents across moment orders compared with the Gaussian q over two reference'});}
function historical(){chart('original-chart',[{data:ORIGINAL_POWERS.map((x,i)=>({x,y:ORIGINAL_VOL[i]})),dots:true,name:'Volatility d'},{data:ORIGINAL_POWERS.map((x,i)=>({x,y:ORIGINAL_VOLUME[i]})),color:TEAL,dots:true,name:'Volume d'}],{xlabel:'Power q',ylabel:'Reported fractional-dependence estimate d̂',xmin:0,xmax:4,ymin:0,ymax:.5,xticks:[0,1,2,3,4],label:'Original chapter Table 1.4: reported persistence estimates for power transformations of volatility and volume'});$('original-table').innerHTML=ORIGINAL_POWERS.map((q,i)=>`<tr><td>${pretty(q)}</td><td>${pretty(ORIGINAL_VOL[i],4)}</td><td>${pretty(ORIGINAL_VOLUME[i],4)}</td></tr>`).join('');}
function measuredSummary(){if(!curves)return dataState==='loading'?'Loading measured series':'No measured series derived yet';const v=curves.variants[measuredVariant],p=curves.provenance;return `${p.label} · ${p.resolutionMin}-minute · ${p.from} to ${p.to} · ${v.n.toLocaleString('en-US')} returns`;}
async function loadManifest(){
  try{const response=await fetch('./data/manifest.json',{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);
    manifest=await response.json();const list=manifest?.datasets??[];
    if(list.length){$('measured-asset').innerHTML=list.map(d=>`<option value="${escape(d.symbol)}">${escape(d.label)}</option>`).join('');return loadCurves(list[0].symbol);}
    dataState='empty';
  }catch{dataState='empty';}
  render();
}
async function loadCurves(symbol){
  const entry=(manifest?.datasets??[]).find(d=>d.symbol===symbol);
  if(!entry){dataState='empty';render();return;}
  dataState='loading';curvesFor=symbol;render();
  try{const response=await fetch('./data/'+entry.file,{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);
    const payload=await response.json();
    if(payload.schema!==1)throw Error('unsupported payload version '+payload.schema);
    curves=payload;dataState='ready';dataMessage=measuredSummary();
  }catch(error){curves=null;dataState='error';dataMessage='Could not load '+entry.file+': '+error.message;}
  render();
}
function measured(){
  if(dataState==='idle'){dataState='loading';loadManifest();}
  const ready=dataState==='ready'&&curves;
  $('measured-body').hidden=!ready;$('measured-status').hidden=!!ready;
  document.querySelector('.measured-controls').hidden=dataState!=='ready';
  if(!ready){$('measured-notice').innerHTML='';
    $('measured-status').innerHTML=dataState==='loading'?'Loading measured series&hellip;':dataState==='error'?escape(dataMessage)
      :'No derived series yet. Populate the research store with <code>npm run ingest</code>, then build the curves with <code>npm run derive</code>. To review this view against a labelled placeholder first, run <code>npm run derive:fixture</code>.';
    return;}
  const p=curves.provenance,v=curves.variants[measuredVariant],diag=curves.diagnostics;
  $('measured-notice').innerHTML=p.kind==='fixture'
    ?'<div class="notice"><strong>Fixture, not a measurement</strong>This series is synthetic, generated by <code>scripts/derive.mjs --fixture</code> so that the view can be reviewed before the backfill has run. Every number below is a placeholder. None of it is measured from a market, and none of it should be read against the reported table except to confirm that the comparison renders.</div>'
    :'';
  $('measured-asset-help').textContent=p.source+(p.adjusted===null?'':p.adjusted?' · split adjusted':' · unadjusted');
  $('measured-metrics').innerHTML=[
    ['Returns used',v.n.toLocaleString('en-US'),VARIANT_LABELS[measuredVariant]],
    ['Gaps dropped',diag.gapsDropped.toLocaleString('en-US'),'Session boundaries, holidays and halts'],
    ['Bandwidth m',String(v.bandwidth),'Fourier frequencies in the fit'],
    ['Return volatility',pretty(v.summary.sd,3)+'%','Per '+p.resolutionMin+'-minute observation'],
  ].map(([label,value,note])=>`<div class="metric"><p class="metric-label">${label}</p><p class="metric-value">${value}</p><p class="metric-note">${note}</p></div>`).join('');
  const band=k=>v.d.map(pt=>({x:pt.x,y:pt.y+k*2*pt.se}));
  chart('measured-d-chart',[
    {data:v.d.map(pt=>({x:pt.x,y:pt.y})),color:PURPLE,dots:true,name:'Measured d'},
    {data:band(1),color:GRAY,dash:true,reference:true},{data:band(-1),color:GRAY,dash:true,reference:true},
    {data:ORIGINAL_POWERS.map((x,i)=>({x,y:ORIGINAL_VOL[i]})),color:BLUE,dots:true,reference:true},
    {data:ORIGINAL_POWERS.map((x,i)=>({x,y:ORIGINAL_VOLUME[i]})),color:TEAL,dots:true,reference:true},
  ],{xmin:0,xmax:4,xticks:[0,1,2,3,4],xlabel:'Power q',ylabel:'Fractional dependence d̂',label:'Measured fractional-dependence estimates across power transformations, shown against the reported chapter table'});
  $('measured-fit').textContent='GPH · m = '+v.bandwidth;
  $('measured-d-note').innerHTML=`Preprocessing: ${VARIANT_LABELS[measuredVariant]}. The band is two asymptotic standard errors, &plusmn;${pretty(2*v.d[0].se,3)}. The regression&rsquo;s R&sup2; is not a useful diagnostic for this estimator, because log-periodogram errors are log-&chi;&sup2; distributed, so a confidence band is reported instead. The reported Alcatel series are transcribed constants at daily frequency on a different instrument and period; they are drawn here for reference, not as a target.`;
  chart('measured-zeta-chart',[
    {data:v.zeta,color:PURPLE,dots:true,name:'ζ(q)'},
    {data:[{x:0,y:0},{x:4,y:2}],color:GRAY,dash:true,reference:true},
  ],{xmin:0,xmax:4,xticks:[0,1,2,3,4],xlabel:'Moment order q',ylabel:'Scaling exponent ζ(q)',label:'Measured scaling exponents across moment orders, against the Gaussian q over two reference'});
  const scales=v.structure[7]?.scales??[];
  $('measured-scales').textContent=scales.length?`${scales.length} scales · k = 1 to ${scales.at(-1)}`:'';
  chart('measured-acf-chart',v.acf.map((a,i)=>({data:a.points,color:[PURPLE,BLUE,TEAL][i],name:'q = '+a.q})),
    {xmin:1,xmax:v.acf[0]?.points.length??1,ymin:-.1,ymax:1,xlabel:'Lag (observations)',ylabel:'Correlation',xformat:x=>String(Math.round(x)),label:'Autocorrelation of absolute returns at three power transformations'});
  $('measured-provenance').innerHTML=[
    ['Series',p.label],['Symbol',p.symbol],['Source',p.source],
    ['Nature',p.kind==='fixture'?'synthetic placeholder':'measured observations'],
    ['Resolution',p.resolutionMin+' minute'],['Window',p.from+' to '+p.to],
    ['Bars loaded',diag.barsLoaded.toLocaleString('en-US')],['Returns used',v.n.toLocaleString('en-US')],
    ['Gaps dropped',diag.gapsDropped.toLocaleString('en-US')],['Time-of-day buckets',String(diag.buckets)],
    ['Adjustment',p.adjusted===null?'not applicable':p.adjusted?'split adjusted':'unadjusted'],
    ['Derived at',String(p.generatedAt).slice(0,16).replace('T',' ')+' UTC'],
  ].map(([k,val])=>`<div><dt>${escape(k)}</dt><dd>${escape(val)}</dd></div>`).join('');
}
function syncControls(){for(const k of Object.keys(DEFAULTS)){if($(k).value!==String(params[k]))$(k).value=String(params[k]);}for(const k of ['lambda','depth','sigma','power'])$(k+'-value').textContent=k==='lambda'?pretty(params[k],3):k==='sigma'?pretty(params[k])+'%':k==='depth'?String(params[k]):pretty(params[k]);const simulationActive=!['measured','chapter'].includes(activeTab);$('controls-inactive').hidden=simulationActive;for(const key of Object.keys(DEFAULTS))$(key).disabled=!simulationActive||(key==='lambda'&&params.model==='gaussian');$('new-seed').disabled=$('reset').disabled=!simulationActive;$('sample-help').textContent=(2**params.depth).toLocaleString('en-US')+' simulated observations · 2^'+params.depth;$('model-help').textContent=params.model==='cascade'?'Gaussian shocks multiplied by a volatility cascade.':'Independent Gaussian returns with constant volatility.';$('formula').innerHTML=params.model==='cascade'?'r<sub>t</sub> = σ<sub>t</sub> Z<sub>t</sub><br><span>σ<sub>t</sub> = σ₀ ∏ W<sub>j,t</sub></span>':'r<sub>t</sub> = σ₀ Z<sub>t</sub><br><span>Z<sub>t</sub> ∼ N(0, 1)</span>';const measuredKind=curves?.provenance?.kind,state=activeTab==='chapter'?'historical':activeTab!=='measured'?'simulated':measuredKind==='fixture'?'fixture':measuredKind==='measured'?'measured':'simulated';$('experiment-summary').textContent=state==='historical'?'Alcatel · 1991–2001 · reported values':activeTab==='measured'?measuredSummary():(params.model==='cascade'?'Lognormal cascade':'Gaussian benchmark')+' · '+(2**params.depth).toLocaleString('en-US')+' observations · seed '+params.seed;$('data-tag').textContent={historical:'ORIGINAL RESULTS',fixture:'FIXTURE DATA',measured:'MEASURED DATA',simulated:'SIMULATED DATA'}[state];for(const s of ['historical','measured','fixture'])$('data-tag').classList.toggle(s,state===s);}
function render(){syncControls();const key=JSON.stringify([params.model,params.lambda,params.depth,params.sigma,params.seed]);if(key!==lastSimulationKey){simulation=simulate(params);lastSimulationKey=key;}if(activeTab==='returns')distribution();else if(activeTab==='memory')memory();else if(activeTab==='scaling')multiscaling();else if(activeTab==='measured')measured();else historical();$('live-status').textContent='Updated '+activeTab+' view. '+(activeTab==='measured'?dataMessage||'Measured series.':activeTab==='chapter'?'Reported values from the original table.':(2**params.depth)+' observations, seed '+params.seed+'.');}
function update(input){const candidate=validateParams({...params,...input});params=candidate;clearTimeout(pending);$('error').hidden=true;render();return {parameters:{...params},view:activeTab,statistics:stats(aggregate(simulation.returns,params.horizon))};}
function setTab(tab){if(!['returns','memory','scaling','measured','chapter'].includes(tab))throw Error('Unknown view.');activeTab=tab;for(const t of document.querySelectorAll('[role=tab]')){const selected=t.dataset.tab===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;$('panel-'+t.dataset.tab).hidden=!selected;}render();}
for(const k of Object.keys(DEFAULTS))$(k).addEventListener(k==='seed'?'change':'input',()=>{try{const raw=$(k).value;if(raw.trim()==='')throw Error('Enter a seed between 0 and 999999.');const value=k==='model'?raw:Number(raw);update({[k]:value});}catch(error){$('error').textContent=error.message;$('error').hidden=false;}});
$('new-seed').addEventListener('click',()=>{const draw=new Uint32Array(1);crypto.getRandomValues(draw);update({seed:draw[0]%1000000});});
$('reset').addEventListener('click',()=>{logDensity=false;$('log-density').checked=false;update({...DEFAULTS});});
$('log-density').addEventListener('change',()=>{logDensity=$('log-density').checked;distribution();});
for(const tab of document.querySelectorAll('[role=tab]')){tab.addEventListener('click',()=>setTab(tab.dataset.tab));tab.addEventListener('keydown',e=>{const all=[...document.querySelectorAll('[role=tab]')],i=all.indexOf(tab);let index;if(e.key==='ArrowRight')index=(i+1)%all.length;else if(e.key==='ArrowLeft')index=(i+all.length-1)%all.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=all.length-1;else return;e.preventDefault();all[index].focus();setTab(all[index].dataset.tab);});}
$('measured-asset').addEventListener('change',()=>loadCurves($('measured-asset').value));
$('measured-variant').addEventListener('change',()=>{measuredVariant=$('measured-variant').value;render();});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
render();
// Structured access uses the same validation and state transitions as the UI.
const context=document.modelContext;
if(context?.registerTool){const lifecycle=new AbortController();const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'configure_volatility_experiment',title:'Configure volatility experiment',description:'Set simulation parameters and update the visible experiment. Returns sample statistics; does not export data.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{model:{type:'string',enum:['cascade','gaussian']},lambda:{type:'number',minimum:0,maximum:.12,multipleOf:.005},depth:{type:'integer',minimum:8,maximum:13},sigma:{type:'number',minimum:.25,maximum:3,multipleOf:.25},horizon:{type:'integer',enum:[1,5,20,64]},power:{type:'number',minimum:.25,maximum:4,multipleOf:.25},seed:{type:'integer',minimum:0,maximum:999999}},additionalProperties:false},execute(input){if(input?.horizon!==undefined&&![1,5,20,64].includes(input.horizon))throw Error('Choose horizon 1, 5, 20 or 64.');if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected parameter object.');for(const k of Object.keys(input))if(!(k in DEFAULTS))throw Error('Unknown parameter: '+k);return update(input);}});
  register({name:'show_volatility_analysis',title:'Show volatility analysis',description:'Switch to returns, memory, scaling, or the original chapter results.',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:{view:{type:'string',enum:['returns','memory','scaling','chapter']}},required:['view'],additionalProperties:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='view'))throw Error('Expected a view.');setTab(input.view);return {view:activeTab,parameters:{...params}};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
