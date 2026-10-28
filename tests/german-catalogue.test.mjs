import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {getLesson, LESSONS} from '../src/lesson-catalogue.js';
import {existsSync} from 'node:fs';
import {validateGermanLesson, validateCatalogue} from '../scripts/validate-german-catalogue.mjs';
import sun from '../research/german-draft/basic/sun.de-DE.mjs';
const lesson=getLesson('sun');
const source=JSON.parse(readFileSync(new URL('../research/german-draft/basic/sun.de-DE.source.json',import.meta.url),'utf8'));
test('Sun covers the source and preserves the real-sun warning and optional face',()=>{
  assert.equal(validateGermanLesson(lesson,sun,source).stageCount,20);
  assert.match(sun.stages.notice.hint,/niemals direkt in die echte Sonne/i);
  assert.match(sun.stages['sun-left-eye'].spoken,/echte Sonne hat kein Gesicht/i);
  assert.match(sun.stages['sun-smile'].spoken,/lass den Mund weg/i);
});
test('catalogue gate rejects missing, modified or wrongly identified records',()=>{
  const entry={record:sun,source};
  assert.throws(()=>validateCatalogue([lesson],new Map()),/incomplete/);
  assert.throws(()=>validateGermanLesson({...lesson,strokes:[]},sun,source),/source or geometry changed/);
  const broken=structuredClone(sun); delete broken.stages['sun-smile'];
  assert.throws(()=>validateGermanLesson(lesson,broken,source),/stage order/);
  assert.throws(()=>validateGermanLesson(lesson,{...sun,locale:'en-GB'},source),/identity/);
  assert.equal(validateCatalogue([lesson],new Map([['sun',entry]])).stages,20);
});
test('full release gate fails while any source lesson is missing',()=>{
  const result=spawnSync(process.execPath,['scripts/validate-german-catalogue.mjs'],{encoding:'utf8'});
  const complete=LESSONS.every(lesson => existsSync(`research/german-draft/${lesson.level}/${lesson.id}.de-DE.mjs`) && existsSync(`research/german-draft/${lesson.level}/${lesson.id}.de-DE.source.json`));
  if (complete) { assert.equal(result.status,0,result.stderr); assert.equal(JSON.parse(result.stdout).lessons,LESSONS.length); }
  else { assert.notEqual(result.status,0); assert.equal(result.stdout,''); assert.match(result.stderr,/catalogue is incomplete/); }
  const progress=spawnSync(process.execPath,['scripts/validate-german-catalogue.mjs','--progress'],{encoding:'utf8'});
  assert.equal(progress.status,0,progress.stderr); const output=JSON.parse(progress.stdout);
  assert.equal(output.drafted + output.missing.length, output.total); assert.equal(output.releaseReady,false);
});

test('German dynamic accessibility labels follow the actual lesson stages',async()=>{
  const {demonstrationLabel,stageLabel,timelineEstimate} = await import('../research/german-draft/dynamic.de-DE.js');
  const cat=getLesson('cat');
  assert.match(demonstrationLabel(cat,0),/fertiges Beispiel/i);
  assert.equal(stageLabel(cat,0),'ANSCHAUEN');
  assert.match(stageLabel(cat,cat.steps.findIndex(step=>step.kind==='colour')),/AUSMALEN 1 VON/);
  assert.match(demonstrationLabel(cat,cat.steps.findIndex(step=>step.kind==='colour')),/Vorführung zum Ausmalen/);
  assert.equal(timelineEstimate({estimateLabel:'About 3 min left',remainingMs:130000},()=>{throw Error('unexpected fallback');}),'Noch etwa 3 Min.');
  assert.equal(timelineEstimate({estimateLabel:'Paused · nothing moves ahead',remainingMs:0},()=> 'Pausiert'),'Pausiert');
});

test('Rainbow and Balloon retain optional details and source-specific teaching',async()=>{
  const rainbow=(await import('../research/german-draft/basic/rainbow.de-DE.mjs')).default;
  const balloon=(await import('../research/german-draft/basic/balloon.de-DE.mjs')).default;
  assert.match(rainbow.parentNote,/beliebige Farben/);
  assert.match(rainbow.stages['colour-choice'].spoken,/ineinander über/);
  assert.match(rainbow.stages['inner-arch'].spoken,/acht Linien.*sieben Zwischenräume/);
  assert.match(balloon.stages['left-bow-loop'].spoken,/Entscheidung/);
  assert.match(balloon.stages['right-bow-loop'].hint,/allein/);
  assert.match(balloon.stages['colour-body-left'].spoken,/Lichtschein weiß/);
  assert.match(balloon.parentNote,/keine Lernfrist/);
});

test('complete German text export covers the exact catalogue and never enables the locale',()=>{
  const result=spawnSync(process.execPath,['scripts/validate-german-catalogue.mjs','--export-text'],{encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr);
  const data=JSON.parse(result.stdout);
  assert.equal(data.status,'assistant-draft-awaiting-native-human-review');
  assert.equal(Object.keys(data.lessons).length,LESSONS.length);
  const stages=LESSONS.reduce((sum,lesson)=>sum+lesson.steps.length,0);
  assert.equal(data.stages,stages);
  assert.equal(Object.keys(data.texts).length,stages*2);
  assert.equal(new Set(data.narrationKeys).size,stages*2);
  for (const lesson of LESSONS) {
    const translated=data.lessons[lesson.id];
    assert.deepEqual(Object.keys(translated.steps),lesson.steps.map(step=>step.id));
    for (const step of lesson.steps) {
      assert.equal(data.texts[`${lesson.id}/${step.id}/instruction`],translated.steps[step.id].spoken);
      assert.equal(data.texts[`${lesson.id}/${step.id}/hint`],translated.steps[step.id].hint);
    }
  }
});

test('safety and source-specific guidance survives in the complete drafts',async()=>{
  const getDraft=async(level,id)=>(await import(`../research/german-draft/${level}/${id}.de-DE.mjs`)).default;
  const sun=await getDraft('basic','sun'), sail=await getDraft('intermediate','sailboat'), tree=await getDraft('expert','tree-path');
  assert.match(sun.stages.notice.hint,/niemals direkt in die echte Sonne/i);
  assert.match(sail.stages['boat-sun'].spoken,/nicht in die echte Sonne/i);
  assert.match(tree.stages['landscape-sun'].spoken,/niemals die echte Sonne/i);
  const cactus=await getDraft('intermediate','cactus'), mushroom=await getDraft('basic','mushroom');
  assert.match(cactus.stages['cactus-left-spine'].spoken,/keine echte Pflanze anzufassen/i);
  assert.match(mushroom.parentNote,/keine Anleitung zum Erkennen essbarer Pilze/i);
  const robot=await getDraft('intermediate','robot'), fruit=await getDraft('expert','fruit-bowl');
  assert.match(robot.parentNote,/nicht als echten Begleiter mit Autorität oder Gefühlen/i);
  assert.match(robot.stages['robot-antenna-tip'].spoken,/nahe am Ende/i);
  assert.match(fruit.stages['banana-upper-edge'].spoken,/durchgehenden Bogen/i);
  assert.match(fruit.stages['banana-lower-edge'].spoken,/hebe ab/i);
});
