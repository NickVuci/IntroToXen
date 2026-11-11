// Headless-browser walk through the JI lesson exercises. Needs Playwright and Chrome:
//   python3 -m http.server 8765  (in the repo root), then
//   node tests/browser-flow.mjs http://127.0.0.1:8765 /tmp/shots
// Not part of node --test; run it by hand after interface changes.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = process.argv[2], shots = process.argv[3];
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : detail); };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const ticks = () => page.locator('.exerciseItem input').evaluateAll(n => n.map(b => b.checked));
const download = async click => { const [d] = await Promise.all([page.waitForEvent('download'), click()]); const path = `${shots}/${d.suggestedFilename()}`; await d.saveAs(path); return { name: d.suggestedFilename(), text: fs.readFileSync(path, 'utf8') }; };

// --- lesson -> exercise 1
await page.goto(`${base}/template.html?lesson=lessons/just-intonation.json&section=exercises`);
await page.waitForSelector('.exerciseOpen', { state: 'attached' }); await page.waitForTimeout(1500);
check('?section=exercises opens the Exercises section', await page.evaluate(() => document.querySelector('.sectionLayer.active').dataset.sectionType) === 'exercises');
check('exercises in the new order with their own links', JSON.stringify(await page.locator('.exerciseOpen').allTextContents()) === JSON.stringify(['Open the scale builder', 'Open the piano roll', 'Open the piano roll']));
await Promise.all([page.waitForURL('**/workstation/index.html?lesson=just-intonation&task=ji-scale'), page.locator('.exerciseOpen').first().click()]);
await page.waitForSelector('#palette button');

// --- scale builder
check('scale view only: no piano roll', await page.locator('#rollCard').isHidden() && await page.locator('#scaleCard').isVisible());
check('task wording shown', (await page.textContent('#taskTitle')) === 'Make a JI scale');
check('palette shows all 48 intervals of the 15-odd-limit', await page.locator('#palette button').count() === 48);
check('starts at 1/1 only', (await page.textContent('#scaleMeta')).startsWith('1 note'));
check('control bar: Exercises · Play scale · Save scale', JSON.stringify(await page.locator('.controlBar button').allTextContents()) === JSON.stringify(['Exercises', 'Play scale', 'Save scale']));
await page.click('#barRight');
check('saving too small a scale explains what is missing', (await page.textContent('#scaleStatus')).includes('needs 5 just intervals'), await page.textContent('#scaleStatus'));
await page.selectOption('#presetSelect', 'preset:ptolemy-intense-diatonic');
const diagramText = await page.locator('#scaleDiagram text').allTextContents();
check('preset fills the scale and the diagram (ratios and steps)', ['9/8', '5/4', '4/3', '3/2', '5/3', '15/8', '2/1', '10/9', '16/15'].every(t => diagramText.includes(t)), diagramText.join(' '));
check('preset selected on the palette', JSON.stringify(await page.locator('#palette button[aria-pressed="true"]').allTextContents()) === JSON.stringify(['4/3', '3/2', '5/4', '5/3', '9/8', '15/8']));
await page.click('#palette button[data-interval="7/4"]');          // alter the preset
check('altering the preset: 7/4 added, odd limit shown', (await page.textContent('#scaleMeta')) === '8 notes · 15-odd-limit' && (await page.textContent('#scaleStatus')).includes('968.83¢'), await page.textContent('#scaleMeta'));
await page.click('#palette button[data-interval="15/8"]');
await page.fill('#scaleName', 'Septimal Ptolemy'); await page.press('#scaleName', 'Enter');
await page.click('#barMain');
await page.waitForTimeout(300);
check('Play scale runs the audio clock', await page.evaluate(() => window.XenAudio.currentTime() > 0.1));
const scl = await download(() => page.click('#exportScl'));
check('.scl export is exact', scl.name === 'Septimal-Ptolemy.scl' && scl.text.includes(' 7\n!\n 9/8\n 5/4\n 4/3\n 3/2\n 5/3\n 7/4\n 2/1\n'), scl.text);
const kbm = await download(() => page.click('#exportKbm'));
check('.kbm export maps 7 keys to 220 Hz on note 60', kbm.text.split('\n').filter(l => !l.startsWith('!')).slice(0, 7).join(',') === '7,0,127,60,60,220,7', kbm.text);
await page.screenshot({ path: `${shots}/scale-builder.png`, fullPage: true });
const before = await page.locator('#palette').boundingBox();
await page.click('#barRight');
check('saving completes the exercise and points to the next', (await page.textContent('#taskState')) === 'Complete. Next: Write a melody in a JI scale.', await page.textContent('#taskState'));
check('nothing moved when the verdict appeared', JSON.stringify(before) === JSON.stringify(await page.locator('#palette').boundingBox()));
check('back link appears', await page.locator('#taskBack').evaluate(n => getComputedStyle(n).visibility) === 'visible');
await page.screenshot({ path: `${shots}/scale-complete.png` });
await Promise.all([page.waitForURL('**/template.html**'), page.click('#taskBack')]);
await page.waitForSelector('.exerciseOpen', { state: 'attached' }); await page.waitForTimeout(1500);
check('back in the lesson on Exercises with the first ticked', JSON.stringify(await ticks()) === '[true,false,false]' && await page.evaluate(() => document.querySelector('.sectionLayer.active').dataset.sectionType) === 'exercises');

// --- melody in the piano roll
await Promise.all([page.waitForURL('**task=ji-melody'), page.locator('.exerciseOpen').nth(1).click()]);
await page.waitForSelector('.cell');
check('roll view only: no scale builder', await page.locator('#scaleCard').isHidden() && await page.locator('#rollCard').isVisible());
const labels = await page.locator('.rowLabel').allTextContents();
check('rows are the saved scale', JSON.stringify(labels) === JSON.stringify(['2/1', '7/4', '5/3', '3/2', '4/3', '5/4', '9/8', '1/1']), labels.join(' '));
check('eight bars of 4/4', (await page.textContent('#gridMeta')).includes('8 bars of 4/4') && await page.locator('.cell[data-row="0"]').count() === 64, await page.textContent('#gridMeta'));
check('opening line names the scale', (await page.textContent('#status')) === 'Using your scale, Septimal Ptolemy.');
check('control bar: Exercises · Play · Export', JSON.stringify(await page.locator('.controlBar button').allTextContents()) === JSON.stringify(['Exercises', 'Play', 'Export']));
const row = l => labels.indexOf(l);
let col = 0;
for (const l of ['1/1', '9/8', '5/4', '3/2', '7/4', '3/2', '5/4', '1/1']) { await page.click(`.cell[data-row="${row(l)}"][data-column="${col}"]`); col += 4; }
check('ready message before exporting', (await page.textContent('#taskState')).startsWith('Ready. Press Export'));
await page.click('#barMain'); await page.waitForTimeout(600);
check('Play runs the transport', (await page.textContent('#barMain')) === 'Stop'); await page.click('#barMain');
await page.screenshot({ path: `${shots}/melody-roll.png`, fullPage: true });
const proj = await download(() => page.click('#barRight'));
const saved = JSON.parse(proj.text);
check('export holds ratios as text and degree notes', saved.tuning.scale.includes('7/4') && saved.notes.length === 8 && saved.notes.every(n => Number.isInteger(n.pitch.degree)));
check('exporting completes the melody exercise', (await page.textContent('#taskState')) === 'Complete. Next: Find a chord in a JI scale.', await page.textContent('#taskState'));

// --- chord
await page.click('#barLeft'); await page.waitForSelector('.exerciseOpen', { state: 'attached' }); await page.waitForTimeout(1500);
check('two ticked after the melody', JSON.stringify(await ticks()) === '[true,true,false]');
await Promise.all([page.waitForURL('**task=ji-chord'), page.locator('.exerciseOpen').nth(2).click()]);
await page.waitForSelector('.cell');
check('chord exercise: 4 bars, Save', (await page.textContent('#gridMeta')).includes('4 bars') && (await page.textContent('#barRight')) === 'Save');
const labels2 = await page.locator('.rowLabel').allTextContents();
for (const l of ['1/1', '5/4', '3/2']) await page.click(`.cell[data-row="${labels2.indexOf(l)}"][data-column="0"]`);
await page.click('#barRight');
check('saving the chord completes the lesson', (await page.textContent('#taskState')) === 'Complete. Every exercise is done, and so is the lesson.', await page.textContent('#taskState'));
check('concept recorded as complete for the map', await page.evaluate(() => localStorage.getItem('intro-to-xen-map-progress')) === '["just-intonation"]');
await page.click('#barLeft'); await page.waitForSelector('.exerciseOpen', { state: 'attached' }); await page.waitForTimeout(1500);
check('lesson shows all ticked and Complete.', JSON.stringify(await ticks()) === '[true,true,true]' && (await page.textContent('.exerciseVerdict')) === 'Complete.');
await page.screenshot({ path: `${shots}/lesson-exercises2.png` });

// --- returning to the scale exercise reopens the saved scale
await Promise.all([page.waitForURL('**task=ji-scale'), page.locator('.exerciseOpen').first().click()]);
await page.waitForSelector('#palette button');
check('scale exercise reopens the saved scale', (await page.inputValue('#scaleName')) === 'Septimal Ptolemy' && (await page.textContent('#scaleMeta')).startsWith('7 notes') && (await page.textContent('#taskState')).startsWith('Complete.'));

// --- lab inside the lesson -> full workstation
await page.goto(`${base}/template.html?lesson=lessons/just-intonation.json&section=lab`); await page.waitForTimeout(1600);
const lab = page.frameLocator('.sectionLayer.active iframe');
await lab.locator('summary').click(); await lab.locator('.genMelody').first().click();
await Promise.all([page.waitForURL('**/workstation/index.html?lesson=just-intonation'), lab.locator('#sendButton').click()]);
await page.waitForSelector('.cell');
check('lab handoff opens the full workstation with the loop', await page.locator('.noteBar').count() === 16 && await page.locator('#scaleCard').isVisible() && await page.locator('#rollCard').isVisible());
check('full workstation from a lesson: Back to the lesson', (await page.textContent('#barLeft')) === 'Back to the lesson' && await page.locator('#openProjects').isVisible());

// --- standalone full workstation, phone width, ivory
const p2 = await browser.newPage({ viewport: { width: 380, height: 800 }, colorScheme: 'light' });
p2.on('pageerror', e => errors.push(String(e)));
await p2.goto(`${base}/workstation/index.html?lesson=just-intonation&task=ji-scale`); await p2.waitForSelector('#palette button');
check('scale builder fits a phone', await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p2.screenshot({ path: `${shots}/scale-phone.png`, fullPage: true });
check('no console or page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
