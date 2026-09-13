// Finite dyadic realization of the chapter's lognormal multiplicative cascade.
// All simulation choices are disclosed in the page's method notes.
export const DEFAULTS = Object.freeze({model:'cascade',lambda:0.05,depth:12,sigma:1,horizon:1,power:1,seed:2004});
export function rng(seed) {
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function normalGenerator(seed){const random=rng(seed);let spare=null;return ()=>{if(spare!==null){const z=spare;spare=null;return z;}const radius=Math.sqrt(-2*Math.log(Math.max(random(),Number.MIN_VALUE)));const angle=2*Math.PI*random();spare=radius*Math.sin(angle);return radius*Math.cos(angle);};}
export function validateParams(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Parameters must be an object.');
  for(const k of Object.keys(input))if(!(k in DEFAULTS))throw Error('Unknown parameter: '+k);
  const p={...DEFAULTS,...input};
  if(!['cascade','gaussian'].includes(p.model))throw Error('Choose cascade or gaussian.');
  for(const [k,min,max] of [['lambda',0,.12],['sigma',.25,3],['depth',8,13],['horizon',1,64],['power',.25,4],['seed',0,999999]])if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw Error('Invalid '+k+'.');
  for(const k of ['depth','horizon','seed'])if(!Number.isInteger(p[k]))throw Error(k+' must be an integer.');
  if(![1,5,20,64].includes(p.horizon))throw Error('Choose horizon 1, 5, 20 or 64.');
  for(const [k,step] of [['lambda',.005],['sigma',.25],['power',.25]])if(Math.abs(p[k]/step-Math.round(p[k]/step))>1e-8)throw Error(k+' must use increments of '+step+'.');
  return p;
}
export function simulate(input){
  const p=validateParams(input),n=2**p.depth,logSigma=new Float64Array(n),noise=normalGenerator(p.seed),branch=normalGenerator(p.seed^0x9e3779b9);
  const v=p.lambda*Math.LN2;
  for(let level=1;level<=p.depth;level++){
    const width=n/(2**level);
    for(let start=0;start<n;start+=width){const w=-v+Math.sqrt(v)*branch();for(let t=start;t<start+width;t++)logSigma[t]+=w;}
  }
  const returns=new Float64Array(n),sigma=new Float64Array(n),benchmark=new Float64Array(n);
  for(let t=0;t<n;t++){const z=noise();sigma[t]=p.sigma*(p.model==='cascade'?Math.exp(logSigma[t]):1);returns[t]=sigma[t]*z;benchmark[t]=p.sigma*z;}
  return {returns,sigma,benchmark,n};
}
export function mean(x){return x.reduce((a,b)=>a+b,0)/x.length;}
export function stats(x){const m=mean(x);let m2=0,m3=0,m4=0;for(const v of x){const d=v-m;m2+=d*d;m3+=d*d*d;m4+=d*d*d*d;}m2/=x.length;m3/=x.length;m4/=x.length;const sd=Math.sqrt(m2);return {mean:m,sd,skew:sd?m3/sd**3:0,excess:m2?m4/m2**2-3:0,min:Math.min(...x),max:Math.max(...x),tail:sd?x.filter(v=>Math.abs(v-m)>3*sd).length/x.length:0,n:x.length};}
export function aggregate(x,h){const out=[];for(let i=0;i+h<=x.length;i+=h){let s=0;for(let j=0;j<h;j++)s+=x[i+j];out.push(s);}return out;}
export function acf(x,lags=64){const m=mean(x),z=Array.from(x,v=>v-m),den=z.reduce((s,v)=>s+v*v,0);const out=[];for(let k=1;k<=Math.min(lags,x.length-1);k++){let num=0;for(let i=k;i<z.length;i++)num+=z[i]*z[i-k];out.push({x:k,y:den?num/den:0});}return out;}
export function crossCorrelation(x,y,k){const mx=mean(x),my=mean(y);let a=0,b=0,c=0;for(let t=Math.max(0,-k);t<Math.min(x.length,y.length-k);t++){const u=x[t]-mx,v=y[t+k]-my;a+=u*v;b+=u*u;c+=v*v;}return b&&c?a/Math.sqrt(b*c):0;}
export function crossScale(x){const coarse=[],fine=[];for(let t=0;t+5<=x.length;t++){let sum=0,abs=0;for(let i=0;i<5;i++){sum+=x[t+i];abs+=Math.abs(x[t+i]);}coarse.push(Math.abs(sum));fine.push(abs/5);}return Array.from({length:41},(_,i)=>({x:i-20,y:crossCorrelation(coarse,fine,i-20)}));}
export function regress(points){const mx=mean(points.map(p=>p.x)),my=mean(points.map(p=>p.y));let a=0,b=0,sst=0;for(const p of points){a+=(p.x-mx)*(p.y-my);b+=(p.x-mx)**2;sst+=(p.y-my)**2;}const slope=b?a/b:0,intercept=my-slope*mx;const sse=points.reduce((s,p)=>s+(p.y-intercept-slope*p.x)**2,0);return {slope,intercept,r2:sst?1-sse/sst:1};}
export function scaling(x,power){const scales=[1,2,4,8,16,32,64].filter(k=>k<=x.length/16),prefix=[0];for(const v of x)prefix.push(prefix.at(-1)+v);const increments=scales.map(k=>Array.from({length:x.length-k+1},(_,i)=>Math.abs(prefix[i+k]-prefix[i])));const structure=q=>scales.map((k,j)=>({x:Math.log2(k),y:Math.log2(mean(increments[j].map(v=>v**q)))}));const exponents=Array.from({length:16},(_,i)=>{const q=(i+1)/4;return {x:q,y:regress(structure(q)).slope};});const points=structure(power),fit=regress(points);return {exponents,points,fit,scales};}
export const ORIGINAL_POWERS=[.25,.5,.75,1,1.25,1.5,1.75,2,2.25,2.5,2.75,3,3.25,3.5,3.75,4];
export const ORIGINAL_VOL=[.4442,.4469,.4426,.4327,.4146,.3828,.3305,.2565,.1737,.1035,.0567,.0301,.0162,.009,.0054,.0035];
export const ORIGINAL_VOLUME=[.4215,.425,.4272,.4284,.4288,.4284,.4272,.4251,.4221,.4181,.4131,.4069,.3996,.3908,.3806,.3688];
