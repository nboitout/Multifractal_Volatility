// Redraws Figure 1.4 of the printed chapter as dist/chapter/figure-1-4.svg.
//
// The supplied Word reconstruction had no plate for Figure 1.4: it reused the one it
// used for Figure 1.2, and the page carried it labelled "indicative". The figure below
// is traced instead from a photograph of the printed page, so the chapter's own plot is
// shown rather than a stand-in for it.
//
// The series here are READ OFF THAT PLOT BY EYE, to about half a grid division. They are
// not the author's data, and no data file for them exists in this repository. Correct a
// point by editing the arrays and re-running:
//
//     node scripts/figure-1-4.mjs
//
// The printed figure is monochrome, drawn with an outer frame, a legend strip along the
// top, the category axis on the zero line and Excel's marker vocabulary. That furniture
// is kept — this is a facsimile, not a restyling — while the type is the page's own and
// the ink is the page's ink rather than pure black.
import {writeFileSync} from 'node:fs';

// Fine to coarse. Plotted on the negative lags, open squares.
const DAILY_TO_WEEKLY = [
  [-21,.148],[-20,.128],[-19,.112],[-18,.074],[-17,.135],[-16,.112],[-15,.132],
  [-14,.100],[-13,.128],[-12,.106],[-11,.132],[-10,.115],[-9,.140],[-8,.118],
  [-7,.146],[-6,.128],[-5,.158],[-4,.175],[-3,.205],[-2,.245],[-1,.310],[0,.415],
];
// Coarse to fine. Plotted on the positive lags, filled diamonds.
const WEEKLY_TO_DAILY = [
  [0,.415],[1,.128],[2,.300],[3,.335],[4,.300],[5,.250],[6,.222],[7,.205],
  [8,.180],[9,.165],[10,.150],[11,.140],[12,.132],[13,.128],[14,.118],[15,.112],
  [16,.108],[17,.100],[18,.095],[19,.090],[20,.085],[21,.078],
];
// The difference between the two directions, against its band. Dotted, no markers.
const ASYMMETRY = [
  [0,-.005],[1,-.092],[2,-.048],[3,.012],[4,-.062],[5,.034],[6,-.014],[7,.026],
  [8,-.041],[9,.049],[10,-.008],[11,-.033],[12,.031],[13,-.006],[14,.056],
  [15,.004],[16,-.028],[17,.022],[18,-.012],[19,-.031],[20,.061],[21,.017],[22,-.013],
];
const BAND = {upper:.078, lower:-.085, from:0, to:23};

const W=920,H=520,L=74,R=34,T=86,B=52;                 // frame, plot margins
const XMIN=-25,XMAX=25,YMIN=-.2,YMAX=.5;
const INK='#172b46',RULE='#8a99ae',GROUND='#ffffff';
const pw=W-L-R,ph=H-T-B;
const X=v=>L+(v-XMIN)/(XMAX-XMIN)*pw;
const Y=v=>T+(YMAX-v)/(YMAX-YMIN)*ph;
const n=v=>Number(v.toFixed(2));
const path=points=>points.map(([x,y],i)=>`${i?'L':'M'}${n(X(x))},${n(Y(y))}`).join(' ');
const square=(x,y)=>`<rect x="${n(X(x)-3.5)}" y="${n(Y(y)-3.5)}" width="7" height="7" fill="${GROUND}" stroke="${INK}" stroke-width="1.15"/>`;
const diamond=(x,y)=>`<path d="M${n(X(x))},${n(Y(y)-4.4)} L${n(X(x)+4.4)},${n(Y(y))} L${n(X(x))},${n(Y(y)+4.4)} L${n(X(x)-4.4)},${n(Y(y))} Z" fill="${INK}"/>`;
const text=(x,y,s,o={})=>`<text x="${n(x)}" y="${n(y)}" fill="${o.fill||INK}" font-size="${o.size||12.5}" font-family="Inter, system-ui, sans-serif" ${o.anchor?`text-anchor="${o.anchor}"`:''} ${o.style||''}>${s}</text>`;

let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="fig14-title fig14-desc">
<title id="fig14-title">Figure 1.4: Cross-correlations at different horizons</title>
<desc id="fig14-desc">Cross-correlation between coarse and fine volatility against the lag, from minus 25 to 25 days. Both directions peak together at lag zero at about 0.41. Daily-to-weekly correlations occupy the negative lags and settle onto a plateau near 0.13 beyond lag minus 5. Weekly-to-daily correlations occupy the positive lags, hold a shoulder around 0.30 to 0.34 at lags 2 to 4, and decay to about 0.08 by lag 21. The asymmetry between the two directions oscillates about zero within a Gaussian band of roughly plus or minus 0.08.</desc>
<rect width="${W}" height="${H}" fill="${GROUND}"/>
<rect x="1" y="1" width="${W-2}" height="${H-2}" fill="none" stroke="${INK}" stroke-width="1"/>`;

// Legend strip, as the printed figure carries it.
const legendY=34,items=[
  ['Daily to Weekly',x=>`<line x1="${x}" y1="${legendY}" x2="${x+34}" y2="${legendY}" stroke="${INK}" stroke-width="1.7"/>${square(0,0).replace(/x="[-\d.]+"/,`x="${x+13.5}"`).replace(/y="[-\d.]+"/,`y="${legendY-3.5}"`)}`],
  ['Weekly to Daily',x=>`<line x1="${x}" y1="${legendY}" x2="${x+34}" y2="${legendY}" stroke="${INK}" stroke-width="1.7"/><path d="M${x+17},${legendY-4.4} L${x+21.4},${legendY} L${x+17},${legendY+4.4} L${x+12.6},${legendY} Z" fill="${INK}"/>`],
  ['Asymmetry',x=>`<line x1="${x}" y1="${legendY}" x2="${x+34}" y2="${legendY}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="1.5 2.6"/>`],
  ['gaussian bandwith',x=>`<line x1="${x}" y1="${legendY}" x2="${x+34}" y2="${legendY}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="8 3 1.6 3"/>`],
];
let cursor=L-6;
svg+=`<rect x="${L-18}" y="${legendY-21}" width="${W-2*L+36}" height="42" fill="none" stroke="${INK}" stroke-width=".9"/>`;
for(const [label,mark] of items){
  svg+=mark(cursor);
  svg+=text(cursor+41,legendY+4.5,label,{style:label==='gaussian bandwith'?'font-style="italic" font-weight="600"':'font-weight="600"'});
  cursor+=41+label.length*7.4+26;
}

// Grid furniture: the frame of the plot, the zero line carrying the lag labels.
svg+=`<rect x="${n(L)}" y="${n(T)}" width="${n(pw)}" height="${n(ph)}" fill="none" stroke="${RULE}" stroke-width=".9"/>`;
for(let v=-.2;v<=.5001;v+=.1){
  const y=Y(v),label=Math.abs(v)<1e-9?'0':v.toFixed(1);
  svg+=`<line x1="${n(L-5)}" y1="${n(y)}" x2="${n(L)}" y2="${n(y)}" stroke="${RULE}" stroke-width=".9"/>`;
  svg+=text(L-10,y+4.3,label,{anchor:'end',size:12,fill:'#3f5675'});
}
svg+=`<line x1="${n(L)}" y1="${n(Y(0))}" x2="${n(L+pw)}" y2="${n(Y(0))}" stroke="${INK}" stroke-width="1"/>`;
for(let v=XMIN;v<=XMAX;v+=5){
  svg+=`<line x1="${n(X(v))}" y1="${n(Y(0))}" x2="${n(X(v))}" y2="${n(Y(0)+5)}" stroke="${RULE}" stroke-width=".9"/>`;
  if(v!==XMAX)svg+=text(X(v),Y(0)+18,String(v),{anchor:'middle',size:12,fill:'#3f5675'});
}
svg+=text(X(XMAX)-4,Y(0)-9,'Lags',{anchor:'end',size:12.5,fill:'#3f5675'});
svg+=`<text transform="translate(${n(L-46)},${n(T+ph/2)}) rotate(-90)" text-anchor="middle" fill="#3f5675" font-size="12.5" font-family="Inter, system-ui, sans-serif">Correlations</text>`;

// The Gaussian band, then the asymmetry inside it, then the two directions on top.
for(const level of [BAND.upper,BAND.lower])
  svg+=`<line x1="${n(X(BAND.from))}" y1="${n(Y(level))}" x2="${n(X(BAND.to))}" y2="${n(Y(level))}" stroke="${INK}" stroke-width="1.1" stroke-dasharray="8 3 1.6 3"/>`;
svg+=`<path d="${path(ASYMMETRY)}" fill="none" stroke="${INK}" stroke-width="1.15" stroke-dasharray="1.5 2.6" stroke-linejoin="round"/>`;
for(const series of [DAILY_TO_WEEKLY,WEEKLY_TO_DAILY])
  svg+=`<path d="${path(series)}" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/>`;
for(const [x,y] of WEEKLY_TO_DAILY)svg+=diamond(x,y);
for(const [x,y] of DAILY_TO_WEEKLY)svg+=square(x,y);

svg+='\n</svg>\n';
writeFileSync(new URL('../dist/chapter/figure-1-4.svg',import.meta.url),svg);
console.log(`figure-1-4.svg written · ${DAILY_TO_WEEKLY.length} + ${WEEKLY_TO_DAILY.length} points traced`);
