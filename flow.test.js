// Logic tests for the troubleshooting flow. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, reduce, compareText, simulate, buildSummary, mailtoHref, canRetry } from './flow.js';

const run = (state, ...actions) => actions.reduce(reduce, state);
const start = (id) => run(createState(id), { type: 'open' });

const RULE = {
  id: 'pricing-reply', name: 'Pricing reply', keyword: 'PRICE', matchMode: 'exact',
  action: 'textReply', replyText: 'Thanks for contacting us. Here are our current prices.', active: true,
};

// Path 1 up to the point where the demo rule has been fixed but not yet tested.
const toFixedRetest = () => run(start('keyword-mismatch'),
  { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value: 'yes' }, { type: 'compare' },
  { type: 'editRule', mode: 'keyword' }, { type: 'saveRule', patch: { keyword: 'price' } });

test('compareText is exact: letter case and spaces count, nothing is normalised', () => {
  const cases = [
    ['PRICE', 'PRICE', 'match'],
    ['price', 'PRICE', 'case'],
    ['PRICE ', 'PRICE', 'spaces'],
    [' price', 'PRICE', 'case-and-spaces'],
    ['prices', 'PRICE', 'different'],
    ['What is the PRICE?', 'PRICE', 'different'],
  ];
  for (const [input, keyword, want] of cases) assert.equal(compareText(input, keyword), want, `${input} vs ${keyword}`);
});

test('simulate replies only when match, action, status, visibility and scenario all allow it', () => {
  const ok = { visible: true, unresolved: false };
  assert.deepEqual(simulate(RULE, 'PRICE', ok),
    { replied: true, reason: 'ok', input: 'PRICE', reply: 'Thanks for contacting us. Here are our current prices.' });
  const rows = [
    [RULE, 'price', ok, 'no-match'],
    [{ ...RULE, action: 'assignAgent' }, 'PRICE', ok, 'not-text-reply'],
    [{ ...RULE, active: false }, 'PRICE', ok, 'inactive'],
    [RULE, 'PRICE', { visible: false, unresolved: false }, 'not-visible'],
    [RULE, 'PRICE', { visible: true, unresolved: true }, 'unresolved'],
  ];
  for (const [rule, input, ctx, reason] of rows) {
    const r = simulate(rule, input, ctx);
    assert.equal(r.replied, false, reason);
    assert.equal(r.reason, reason);
    assert.equal(r.reply, undefined, reason);
  }
});

test('path 1: mismatch is explained, the rule changes only on save, then the user confirms', () => {
  let s = start('keyword-mismatch');
  assert.equal(s.step, 'symptom');
  s = run(s, { type: 'symptom', value: 'no-reply' });
  assert.equal(s.step, 'inbox-check');
  s = run(s, { type: 'inbound', value: 'yes' });
  assert.equal(s.step, 'keyword-check');
  s = run(s, { type: 'compare' }); // test message is prefilled from the fixture: "price"
  assert.equal(s.answers.comparison.kind, 'case');
  assert.equal(s.rule.keyword, 'PRICE');
  s = run(s, { type: 'editRule', mode: 'keyword' });
  assert.equal(s.step, 'rule-edit');
  assert.equal(s.rule.keyword, 'PRICE');
  s = run(s, { type: 'saveRule', patch: { keyword: 'price' } });
  assert.equal(s.rule.keyword, 'price');
  assert.equal(s.step, 'retest');
  s = run(s, { type: 'runSim' });
  assert.equal(s.sim.replied, true);
  s = run(s, { type: 'confirm', value: 'yes' });
  assert.equal(s.step, 'success');
});

test('success needs a simulated reply first; a failed simulation can never be confirmed', () => {
  assert.equal(run(toFixedRetest(), { type: 'confirm', value: 'yes' }).step, 'retest');
  const failed = run(start('settings-correct-unresolved'),
    { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value: 'yes' }, { type: 'compare' },
    { type: 'toActionCheck' }, { type: 'toRetest' }, { type: 'runSim' });
  assert.equal(failed.sim.reason, 'unresolved');
  assert.equal(run(failed, { type: 'confirm', value: 'yes' }).step, 'retest');
});

test('"No" or "Not sure" after a good simulation hands off instead of claiming success', () => {
  for (const value of ['no', 'unsure']) {
    const s = run(toFixedRetest(), { type: 'runSim' }, { type: 'confirm', value });
    assert.equal(s.step, 'escalation');
    assert.equal(s.escalation.reason, 'not-confirmed');
  }
});

test('path 2: "can\'t find it" skips the repeat question and escalates with an honest cause', () => {
  let s = run(start('inbound-missing'), { type: 'symptom', value: 'missing-inbox' });
  assert.equal(s.step, 'inbox-recovery');
  s = run(s, { type: 'inboxResult', value: 'missing' });
  assert.equal(s.step, 'escalation');
  assert.equal(s.escalation.reason, 'inbound-missing');
  assert.equal(buildSummary(s).cause,
    'Inbound test message not visible in selected workspace after basic checks; keyword rule not diagnosed.');
});

test('answering "No" or "Not sure" to the Inbox question leads to the grouped Inbox check', () => {
  for (const value of ['no', 'unsure']) {
    const s = run(start('inbound-missing'), { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value });
    assert.equal(s.step, 'inbox-recovery');
  }
});

test('missing inbound reaches success only after the user reports finding the message', () => {
  const found = run(start('inbound-missing'), { type: 'symptom', value: 'missing-inbox' },
    { type: 'inboxResult', value: 'found' }, { type: 'compare' }, { type: 'toActionCheck' },
    { type: 'toRetest' }, { type: 'runSim' }, { type: 'confirm', value: 'yes' });
  assert.equal(found.step, 'success');
  const notFound = run(start('inbound-missing'), { type: 'symptom', value: 'different-action' },
    { type: 'expected', value: 'text' }, { type: 'toRetest' }, { type: 'runSim' });
  assert.equal(notFound.sim.reason, 'not-visible');
});

test('path 3: correct-looking settings get no simulated reply and escalate with an unknown cause', () => {
  let s = run(start('settings-correct-unresolved'),
    { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value: 'yes' }, { type: 'compare' });
  assert.equal(s.answers.comparison.kind, 'match');
  s = run(s, { type: 'toActionCheck' }, { type: 'toRetest' }, { type: 'runSim' });
  assert.equal(s.sim.replied, false);
  s = run(s, { type: 'escalate', reason: 'unresolved' });
  assert.match(buildSummary(s).cause, /root cause unknown/i);
});

test('the generic help button after a failed simulation keeps the specific cause', () => {
  const failed = run(start('settings-correct-unresolved'),
    { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value: 'yes' }, { type: 'compare' },
    { type: 'toActionCheck' }, { type: 'toRetest' }, { type: 'runSim' }, { type: 'escalate' });
  assert.equal(failed.escalation.reason, 'unresolved');
});

test('path 4: a wrong action is corrected in the demo, re-tested and confirmed', () => {
  let s = run(start('wrong-action'), { type: 'symptom', value: 'different-action' });
  assert.equal(s.step, 'action-check');
  s = run(s, { type: 'expected', value: 'text' }, { type: 'editRule', mode: 'action' },
    { type: 'saveRule', patch: { action: 'textReply', replyText: 'Here are our prices.' } }, { type: 'runSim' });
  assert.deepEqual([s.sim.replied, s.sim.reply], [true, 'Here are our prices.']);
  assert.equal(run(s, { type: 'confirm', value: 'yes' }).step, 'success');
});

test('human help opens from the first question and Back returns there', () => {
  const s = run(start('keyword-mismatch'), { type: 'escalate' });
  assert.equal(s.step, 'escalation');
  assert.equal(run(s, { type: 'back' }).step, 'symptom');
});

test('the complex-setup escape hatch goes straight to a handoff', () => {
  const s = run(start('keyword-mismatch'), { type: 'symptom', value: 'complex' });
  assert.equal(s.step, 'escalation');
  assert.equal(s.escalation.reason, 'complex');
});

test('"I\'m not sure" explains once, then hands off instead of guessing', () => {
  let s = run(start('keyword-mismatch'), { type: 'symptom', value: 'unsure' });
  assert.equal(s.step, 'symptom');
  s = run(s, { type: 'symptom', value: 'unsure' });
  assert.equal(s.step, 'escalation');
});

test('Back keeps answers; changing an earlier answer clears the results that depended on it', () => {
  let s = run(start('keyword-mismatch'), { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value: 'yes' }, { type: 'compare' });
  s = run(s, { type: 'back' });
  assert.equal(s.step, 'inbox-check');
  assert.equal(s.answers.inbound, 'yes');
  assert.equal(s.answers.comparison.kind, 'case');
  s = run(s, { type: 'inbound', value: 'no' });
  assert.equal(s.step, 'inbox-recovery');
  assert.equal(s.answers.comparison, undefined);
});

test('editing the test message clears a stale comparison and simulation', () => {
  let s = run(toFixedRetest(), { type: 'runSim' });
  s = run(s, { type: 'testText', value: 'Price' });
  assert.equal(s.answers.comparison, undefined);
  assert.equal(s.sim, null);
});

test('a blank keyword is rejected and the rule stays unchanged', () => {
  const s = run(start('keyword-mismatch'), { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value: 'yes' },
    { type: 'compare' }, { type: 'editRule', mode: 'keyword' }, { type: 'saveRule', patch: { keyword: '   ' } });
  assert.equal(s.step, 'rule-edit');
  assert.equal(s.rule.keyword, 'PRICE');
  assert.ok(s.error);
});

test('a failed retest allows one more fix, then only human help', () => {
  let s = run(start('keyword-mismatch'), { type: 'symptom', value: 'no-reply' }, { type: 'inbound', value: 'yes' },
    { type: 'compare' }, { type: 'editRule', mode: 'keyword' }, { type: 'saveRule', patch: { keyword: 'PRICES' } }, { type: 'runSim' });
  assert.equal(s.sim.reason, 'no-match');
  assert.equal(canRetry(s), true);
  s = run(s, { type: 'editRule', mode: 'keyword' }, { type: 'saveRule', patch: { keyword: 'Price' } }, { type: 'runSim' });
  assert.equal(s.sim.reason, 'no-match');
  assert.equal(canRetry(s), false);
  assert.equal(run(s, { type: 'editRule', mode: 'keyword' }).step, 'retest');
});

test('start over and scenario switch drop demo edits and answers', () => {
  const edited = toFixedRetest();
  const restarted = run(edited, { type: 'startOver' });
  assert.equal(restarted.rule.keyword, 'PRICE');
  assert.deepEqual(restarted.answers, {});
  assert.equal(restarted.step, 'symptom');
  const switched = run(edited, { type: 'scenario', id: 'wrong-action' });
  assert.deepEqual([switched.rule.keyword, switched.rule.action, switched.step], ['PRICE', 'assignAgent', null]);
  assert.doesNotMatch(buildSummary(switched).text, /changed in demo/);
});

test('"Start another check" keeps the saved demo rule but clears the journey', () => {
  const s = run(toFixedRetest(), { type: 'runSim' }, { type: 'confirm', value: 'yes' }, { type: 'anotherCheck' });
  assert.deepEqual([s.rule.keyword, s.step, s.sim], ['price', 'symptom', null]);
  assert.deepEqual(s.answers, {});
});

test('summary keeps user reports apart from demo configuration', () => {
  const s = run(toFixedRetest(), { type: 'runSim' }, { type: 'confirm', value: 'unsure' });
  const sum = buildSummary(s);
  assert.deepEqual(sum.sections.map((x) => x.title), ['Demo configuration', 'User reported', 'Checks in this guide']);
  assert.ok(sum.sections[1].items.some(([k, v]) => k === 'Test message visible in Team Inbox' && v === 'Yes'));
  assert.ok(sum.sections[0].items.some(([k, v]) => k === 'Keyword' && v === 'price (changed in demo from PRICE)'));
});

test('summary keeps the exact-match finding after the keyword is edited', () => {
  const s = run(toFixedRetest(), { type: 'runSim' }, { type: 'confirm', value: 'unsure' });
  const checks = buildSummary(s).sections[2].items;
  assert.ok(checks.some(([k, v]) => k === 'Test message vs keyword (exact match)'
    && v === "Doesn't match: letter case differs (checked against PRICE, before the demo edit)"), JSON.stringify(checks));
});

test('email link goes to support with the summary in the body', () => {
  const href = mailtoHref(run(start('keyword-mismatch'), { type: 'escalate' }));
  assert.ok(href.startsWith('mailto:support@cheerio.in?subject='));
  const body = decodeURIComponent(href.split('&body=')[1]);
  assert.match(body, /Pricing reply/);
  assert.match(body, /USER REPORTED/);
});
