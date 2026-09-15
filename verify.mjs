import assert from 'node:assert/strict';
import {simulate,validateParams,aggregate,stats,acf,scaling,crossScale,partialSigma,ORIGINAL_POWERS,ORIGINAL_VOL,ORIGINAL_VOLUME} from './dist/model.mjs';
const normal=simulate({model:'gaussian',seed:2004,depth:12});
const uniform=simulate({lambda:0,seed:2004,depth:12});
assert.deepEqual(normal.returns,uniform.returns,'Zero-intermittency limit must exactly equal the Gaussian benchmark.');
const cascade=simulate({seed:2004,depth:12});
assert.deepEqual(cascade.returns,simulate({seed:2004,depth:12}).returns,'Seeded reproducibility');
assert.deepEqual(cascade.benchmark,normal.returns,'Gaussian shocks must be common across models');
assert.deepEqual(aggregate([1,2,3,4,5],2),[3,7],'Non-overlapping aggregation and incomplete-block handling');
assert.deepEqual(acf([1,1,1]),[{x:1,y:0},{x:2,y:0}],'Zero-variance series');
assert.equal(ORIGINAL_POWERS.length,16);assert.equal(ORIGINAL_VOLUME.length,16);assert.equal(ORIGINAL_VOL[3],.4327);assert.equal(ORIGINAL_VOLUME[15],.3688);
for(const bad of [{depth:7},{depth:10.5},{lambda:-.1},{lambda:NaN},{seed:1e9},{sigma:0},{model:'rough'},{applied:-1},{applied:14},{applied:2.5},{unknown:1}])assert.throws(()=>validateParams(bad));
assert.equal(validateParams({depth:9,applied:13}).applied,9,'Levels applied cannot exceed the depth of the tree.');

// The cascade view reads the tree the simulation walks. These checks tie what it draws
// to what the simulation used: the levels must be the factorization of logSigma, and
// the partial products must land on the two paths the view draws as its endpoints.
const tree=simulate({seed:2004,depth:11,lambda:.08,sigma:2});
assert.equal(tree.levels.length,11,'One row of multipliers per level.');
tree.levels.forEach((drawn,i)=>assert.equal(drawn.length,2**(i+1),'Level j holds 2^j multipliers.'));
for(let t=0;t<tree.n;t++){
  let branch=0;
  for(let level=1;level<=11;level++)branch+=tree.levels[level-1][Math.floor(t/(2**(11-level)))];
  assert.ok(Math.abs(branch-tree.logSigma[t])<1e-12,'Multipliers along a branch must multiply back to the volatility the simulation used.');
}
assert.deepEqual(Array.from(partialSigma(tree,11,2)),Array.from(tree.sigma),'The whole tree reproduces the simulated volatility.');
assert.ok(Array.from(partialSigma(tree,0,2)).every(v=>v===2),'No levels applied is the constant-volatility benchmark.');
assert.ok(simulate({lambda:0,seed:2004,depth:9}).levels.every(drawn=>Array.from(drawn).every(w=>w===0)),'Zero intermittency draws no multiplier at any level.');
const spentOne=partialSigma(tree,10,2),whole=partialSigma(tree,11,2);
assert.ok(Array.from(spentOne).some((v,t)=>v!==whole[t]),'Dropping the finest level must change the path.');
const gstats=stats(normal.returns);assert.ok(Math.abs(gstats.sd-1)<.07);assert.ok(Math.abs(gstats.excess)<.3);
const gs=scaling(normal.returns,2);assert.ok(Math.abs(gs.fit.slope-1)<.18,'Gaussian second-order slope should be close to one');
for(const model of ['cascade','gaussian'])for(const depth of [8,13])for(const lambda of [0,.12]){const s=simulate({model,depth,lambda,sigma:3,seed:0});assert.ok(Array.from(s.returns).every(Number.isFinite));assert.ok(Array.from(s.sigma).every(v=>Number.isFinite(v)&&v>0));assert.ok(crossScale(s.returns).every(p=>Number.isFinite(p.y)&&Math.abs(p.y)<=1+1e-12));const sc=scaling(s.returns,4);assert.ok(sc.exponents.every(p=>Number.isFinite(p.y)));for(const h of [1,5,20,64])assert.ok(Number.isFinite(stats(aggregate(s.returns,h)).excess));}

console.log(JSON.stringify({status:'passed',checks:['zero-intermittency identity','seed reproducibility','shared Gaussian shocks','aggregation','constant-series handling','historical transcription','parameter validation','Gaussian moments and scaling','parameter endpoints','cascade level factorization','partial-product endpoints'],gaussian:gstats,defaultCascade:stats(cascade.returns),gaussianSecondOrderSlope:gs.fit.slope},null,2));
