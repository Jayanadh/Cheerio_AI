// Cheerio Troubleshoot: content, branching rules and the demo simulator for the
// "my keyword auto-reply isn't working" guide. Pure data and functions (no DOM), so the
// UI shell in app.js could host other issue types later. Only this one is built.

export const SUPPORT_EMAIL = 'support@cheerio.in';

const PRICING_RULE = Object.freeze({
  id: 'pricing-reply',
  name: 'Pricing reply',
  keyword: 'PRICE',
  matchMode: 'exact', // approximate matching is deliberately not simulated
  action: 'textReply',
  replyText: 'Thanks for contacting us. Here are our current prices.',
  active: true,
});

// Prototype-only fixtures for presenting the branches. Not real customer cases.
export const SCENARIOS = {
  'keyword-mismatch': {
    label: 'Keyword case mismatch',
    hint: 'Tested with "price"; the rule expects "PRICE".',
    rule: PRICING_RULE, sampleInbound: 'price', observedInInbox: true, deliverySimulation: 'normal',
  },
  'inbound-missing': {
    label: 'Incoming message missing',
    hint: "The test message can't be found in Team Inbox.",
    rule: PRICING_RULE, sampleInbound: 'PRICE', observedInInbox: false, deliverySimulation: 'normal',
  },
  'settings-correct-unresolved': {
    label: 'Rule looks correct; no reply',
    hint: "Everything visible matches, but the reply still doesn't arrive.",
    rule: PRICING_RULE, sampleInbound: 'PRICE', observedInInbox: true, deliverySimulation: 'unresolved',
  },
  'wrong-action': {
    label: 'Wrong action selected',
    hint: 'The keyword matches, but the rule assigns the chat instead of replying.',
    rule: { ...PRICING_RULE, action: 'assignAgent' }, sampleInbound: 'PRICE', observedInInbox: true, deliverySimulation: 'normal',
  },
};

export const ACTION_LABELS = { textReply: 'Send a text reply', assignAgent: 'Assign chat to an agent' };

export const SYMPTOMS = [
  { value: 'no-reply', label: 'My auto-reply did not arrive', hint: 'You sent the keyword but no automatic reply came back.' },
  { value: 'missing-inbox', label: "I can't find the incoming message in Inbox", hint: "Your test message doesn't show up in Team Inbox." },
  { value: 'different-action', label: 'A different reply or action happened', hint: 'Something else happened, like the chat being assigned.' },
  { value: 'unsure', label: "I'm not sure", hint: "We'll show you where to look." },
];

export const INBOX_CHECKS = [
  { id: 'workspace', label: "I'm in the workspace for the business number I sent the test to" },
  { id: 'allChats', label: 'Team Inbox is showing All chats, and I searched for the chat I tested from' },
  { id: 'separateNumber', label: 'I sent the test from a separate personal WhatsApp number' },
];

export const EXPECTED_OPTIONS = [
  { value: 'text', label: 'An automatic text reply' },
  { value: 'assign', label: 'The chat gets assigned to a teammate' },
  { value: 'unsure', label: "I'm not sure" },
];

// Rich text is an array of strings and { code } / { strong } parts; the UI escapes and styles it.
const code = (v) => ({ code: v });
const strong = (v) => ({ strong: v });

export function compareText(input, keyword) {
  if (input === keyword) return 'match';
  if (input.toLowerCase() === keyword.toLowerCase()) return 'case';
  if (input.trim() === keyword.trim()) return 'spaces';
  if (input.trim().toLowerCase() === keyword.trim().toLowerCase()) return 'case-and-spaces';
  return 'different';
}

export function explainComparison(kind, input, keyword) {
  switch (kind) {
    case 'match': return {
      ok: true,
      title: ['Your test message matches the keyword exactly.'],
      body: ['So the keyword looks fine. Next, check what the rule does when it matches.'],
    };
    case 'case': return {
      title: ["These don't match in the demo rule: ", code(keyword), ' and ', code(input), ' use different letter cases.'],
      body: ['Your rule looks for ', code(keyword), ', but your test message says ', code(input), '. With Exact match in this demo, letter case matters.'],
    };
    case 'spaces': return {
      title: ["These don't match in the demo rule: your test message has extra spaces."],
      body: ['With Exact match in this demo, spaces before or after the text count too.'],
    };
    case 'case-and-spaces': return {
      title: ["These don't match in the demo rule: letter case and spaces are different."],
      body: ['Your rule looks for ', code(keyword), '. With Exact match in this demo, both letter case and extra spaces count.'],
    };
    default: return {
      title: ["These don't match in the demo rule."],
      body: ['Your rule looks for ', code(keyword), '. With Exact match, the whole message has to be exactly the keyword, so a longer or different message won\'t trigger it.'],
    };
  }
}

// Deterministic demo evaluator. It does not model real routing or WhatsApp delivery.
export function simulate(rule, input, { visible, unresolved }) {
  const no = (reason) => ({ replied: false, reason, input });
  if (!rule.active) return no('inactive');
  if (!visible) return no('not-visible');
  if (input !== rule.keyword) return no('no-match');
  if (rule.action !== 'textReply') return no('not-text-reply');
  if (unresolved) return no('unresolved');
  return { replied: true, reason: 'ok', input, reply: rule.replyText };
}

export function explainSimFailure(sim, rule) {
  switch (sim.reason) {
    case 'no-match': return ['Your test message ', code(sim.input), " still doesn't exactly match the keyword ", code(rule.keyword), '.'];
    case 'not-text-reply': return ['The rule assigns the chat to a teammate instead of sending a text reply.'];
    case 'inactive': return ['The rule is paused, so it would not respond.'];
    case 'not-visible': return ["In this scenario your test message isn't visible in Team Inbox, so the rule has nothing to respond to."];
    default: return ["We can't tell why it failed from these settings alone."];
  }
}

export function explainSaved(saved) {
  switch (saved.what) {
    case 'keyword': return ['Demo keyword updated from ', code(saved.from), ' to ', code(saved.to), ". Let's test the intended behavior."];
    case 'action': return ['Demo action updated to ', strong(ACTION_LABELS[saved.to]), ". Let's test the intended behavior."];
    case 'replyText': return ["Demo reply text updated. Let's test the intended behavior."];
    default: return ['Demo test message changed from ', code(saved.from), ' to ', code(saved.to), ". Let's test it against the rule."];
  }
}

// The comparison result, unless the rule has been edited since it was made.
export const currentComparison = (s) => (s.answers.comparison?.keyword === s.rule.keyword ? s.answers.comparison.kind : undefined);

export const testTextOf = (s) => s.answers.testText ?? SCENARIOS[s.scenarioId].sampleInbound;

// User reports win over the fixture default; nothing here is checked against a real account.
function inboundVisible(s) {
  const { inbound, inboxResult } = s.answers;
  if (inboxResult === 'found') return true;
  if (inbound) return inbound === 'yes';
  return SCENARIOS[s.scenarioId].observedInInbox;
}

// One failed simulated test earns one more guided fix; after that we only offer human help.
export const canRetry = (s) => s.simRuns < 2;

const freshJourney = () => ({
  step: null, history: [], answers: {}, sim: null, simRuns: 0,
  saved: null, editMode: null, error: null, escalation: null,
});

export function createState(scenarioId = 'keyword-mismatch') {
  return { scenarioId, rule: { ...SCENARIOS[scenarioId].rule }, open: false, ...freshJourney() };
}

// Later answers depend on earlier ones: changing an answer drops every answer after it.
const ANSWER_ORDER = ['symptom', 'inbound', 'inboxChecks', 'inboxResult', 'testText', 'comparison', 'expected', 'confirm'];

function setAnswer(state, key, value) {
  if (state.answers[key] === value) return state;
  const answers = {};
  for (const k of ANSWER_ORDER) {
    if (k === key) break;
    if (k in state.answers) answers[k] = state.answers[k];
  }
  answers[key] = value;
  return { ...state, answers, sim: null };
}

const go = (state, step) => ({ ...state, step, history: [...state.history, state.step], error: null });

function escalate(state, reason) {
  if (state.step === 'escalation') return state;
  return { ...go(state, 'escalation'), escalation: { reason, from: state.step, mode: state.editMode } };
}

export function reduce(state, action) {
  switch (action.type) {
    case 'open': {
      const fresh = state.step === null || state.step === 'success';
      return { ...state, open: true, ...(fresh ? { ...freshJourney(), step: 'symptom' } : {}) };
    }
    case 'close': return { ...state, open: false };
    case 'scenario': return createState(action.id);
    case 'reset': return createState(state.scenarioId);
    case 'startOver': return { ...createState(state.scenarioId), open: true, step: 'symptom' };
    case 'anotherCheck': return { ...state, ...freshJourney(), step: 'symptom' };

    case 'back': {
      if (!state.history.length) return state;
      return {
        ...state,
        step: state.history[state.history.length - 1],
        history: state.history.slice(0, -1),
        escalation: state.step === 'escalation' ? null : state.escalation,
        error: null,
      };
    }

    case 'symptom': {
      const v = action.value;
      if (v === 'complex') return escalate(setAnswer(state, 'symptom', 'complex'), 'complex');
      if (v === 'unsure' && state.answers.symptom === 'unsure') return escalate(state, 'unsure');
      let s = setAnswer(state, 'symptom', v);
      if (v === 'unsure') return s; // the step now shows where to check; one more try, then help
      if (v === 'missing-inbox') s = setAnswer(s, 'inbound', 'no'); // already answered: don't ask again
      return go(s, { 'no-reply': 'inbox-check', 'missing-inbox': 'inbox-recovery', 'different-action': 'action-check' }[v]);
    }

    case 'inbound': {
      const s = setAnswer(state, 'inbound', action.value);
      return go(s, action.value === 'yes' ? 'keyword-check' : 'inbox-recovery');
    }

    case 'inboxCheck': {
      const checks = { ...state.answers.inboxChecks, [action.id]: !state.answers.inboxChecks?.[action.id] };
      return { ...state, answers: { ...state.answers, inboxChecks: checks } };
    }

    case 'inboxResult': {
      const s = setAnswer(state, 'inboxResult', action.value);
      if (action.value === 'found') return go(s, 'keyword-check');
      return escalate(s, action.value === 'missing' ? 'inbound-missing' : 'no-inbox-access');
    }

    case 'testText': return { ...setAnswer(state, 'testText', action.value), error: null };

    case 'compare': {
      const text = testTextOf(state);
      if (!text) return { ...state, error: 'Type the message you sent in your test.' };
      const s = setAnswer(state, 'testText', text);
      const comparison = { kind: compareText(text, state.rule.keyword), keyword: state.rule.keyword };
      return { ...setAnswer(s, 'comparison', comparison), error: null };
    }

    case 'toActionCheck': return go(state, 'action-check');
    case 'expected': return setAnswer(state, 'expected', action.value);
    case 'toRetest': return { ...go(state, 'retest'), saved: null };

    case 'editRule': {
      if (state.step === 'retest' && !canRetry(state)) return state;
      return { ...go(state, 'rule-edit'), editMode: action.mode };
    }

    case 'cancelEdit': return reduce(state, { type: 'back' });

    case 'saveRule': {
      const next = { ...state.rule, ...action.patch };
      if (!next.keyword.trim()) return { ...state, error: 'Enter a keyword.' };
      if (next.action === 'textReply' && !next.replyText.trim()) return { ...state, error: 'Enter the reply customers should get.' };
      const changed = ['keyword', 'action', 'replyText'].filter((k) => next[k] !== state.rule[k]);
      if (!changed.length) return { ...state, error: "That's the same as the current setting. Change it, or cancel." };
      const what = changed.includes('keyword') ? 'keyword' : changed.includes('action') ? 'action' : 'replyText';
      const { confirm, ...answers } = state.answers; // the confirmation was about the old rule
      return {
        ...go({ ...state, answers }, 'retest'),
        rule: next, sim: null, editMode: null,
        saved: { what, from: state.rule[what], to: next[what] },
      };
    }

    case 'useKeywordAsTest': {
      const from = testTextOf(state);
      const s = setAnswer(state, 'testText', state.rule.keyword);
      return { ...go(s, 'retest'), editMode: null, saved: { what: 'test', from, to: state.rule.keyword } };
    }

    case 'runSim': {
      const { confirm, ...answers } = state.answers;
      const sim = simulate(state.rule, testTextOf(state), {
        visible: inboundVisible(state),
        unresolved: SCENARIOS[state.scenarioId].deliverySimulation === 'unresolved',
      });
      return { ...state, answers, sim, simRuns: state.simRuns + 1 };
    }

    case 'confirm': {
      if (!state.sim?.replied) return state; // a failed or missing simulation can't be confirmed
      const s = setAnswer(state, 'confirm', action.value);
      return action.value === 'yes'
        ? { ...go(s, 'success'), sim: state.sim }
        : { ...escalate(s, 'not-confirmed'), sim: state.sim };
    }

    case 'escalate': {
      // The always-visible help button sends no reason; keep a failed simulation's cause anyway.
      const failedSim = state.step === 'retest' && state.sim && !state.sim.replied;
      const inferred = failedSim ? (state.sim.reason === 'unresolved' ? 'unresolved' : 'retest-failed') : 'manual';
      return escalate(state, action.reason ?? inferred);
    }

    default: throw new Error(`Unknown action: ${action.type}`);
  }
}

// ---- Human-support handoff ------------------------------------------------

const HANDOFF = {
  manual: ["We couldn't confirm the cause. A support specialist should check this.", ''],
  unsure: ["We couldn't confirm what happened. A support specialist should check this.", ''],
  complex: ['This guide only covers a simple keyword-to-text reply.', 'Your setup may involve other routing. A support specialist should check it.'],
  'inbound-missing': ["Your test message isn't showing in Team Inbox. A support specialist should check this.", ''],
  'no-inbox-access': ["You'll need access to Team Inbox to continue.", 'Ask your account admin for access, or share this summary with support.'],
  'no-permission': ["You'll need edit access to change this rule.", 'Your account admin can make this change, or support can help.'],
  routing: ['Your chat routing needs a closer look.', 'A support specialist can help without changing your other automations.'],
  unresolved: ["The visible settings don't explain the missing reply.", 'A support specialist should check this.'],
  'retest-failed': ["We couldn't get the expected reply in this demo.", 'A support specialist should check this.'],
  'not-confirmed': ["The demo shows the expected reply, but it isn't working for you yet.", 'A support specialist should check this.'],
};

const SYMPTOM_LABELS = { ...Object.fromEntries(SYMPTOMS.map((o) => [o.value, o.label])), complex: 'Setup uses a complex workflow or AI assistant' };
const EXPECTED_LABELS = Object.fromEntries(EXPECTED_OPTIONS.map((o) => [o.value, o.label]));
const CONFIRM_LABELS = { yes: 'Yes, in this demo', no: 'No, still not working', unsure: 'Not sure' };
const COMPARISON_LABELS = {
  match: 'Matches exactly',
  case: "Doesn't match: letter case differs",
  spaces: "Doesn't match: extra spaces",
  'case-and-spaces': "Doesn't match: letter case and spaces differ",
  different: "Doesn't match: different text",
};
const SIM_LABELS = {
  ok: 'Expected reply shown',
  'no-match': "No expected reply: test message doesn't match the keyword",
  'not-text-reply': 'No expected reply: rule assigns the chat instead of replying',
  inactive: 'No expected reply: rule is paused',
  'not-visible': 'No expected reply: test message not visible in Inbox',
  unresolved: 'No expected reply in this simulated setup',
};

function inboxLabel({ inbound, inboxResult }) {
  if (inboxResult === 'found') return `${inbound === 'unsure' ? 'Not sure' : 'No'} at first; found it after checking`;
  if (inboxResult === 'missing') return 'No, still missing after checking';
  if (inboxResult === 'no-access') return "Couldn't check: no access to Team Inbox";
  return { yes: 'Yes', no: 'No', unsure: 'Not sure' }[inbound];
}

function causeOf(state) {
  const { reason, mode } = state.escalation ?? { reason: 'manual' };
  const a = state.answers;
  switch (reason) {
    case 'inbound-missing': return 'Inbound test message not visible in selected workspace after basic checks; keyword rule not diagnosed.';
    case 'no-inbox-access': return 'Not diagnosed. The customer can\'t access Team Inbox to look for the test message.';
    case 'complex': return 'Not diagnosed. The setup uses a complex workflow or AI assistant, which this guide doesn\'t cover.';
    case 'unsure': return 'Unknown. The customer wasn\'t sure what happened during their test.';
    case 'no-permission': return mode === 'action'
      ? 'Not confirmed. The rule\'s action may need changing, but the customer can\'t edit this rule.'
      : 'Not confirmed. The keyword may need changing to match the test message, but the customer can\'t edit this rule.';
    case 'routing': return 'Unknown. The rule\'s action and what the customer expected need a routing review by a specialist.';
    case 'unresolved': {
      const seen = a.inboxResult === 'found' || a.inbound === 'yes' ? 'inbound reportedly visible' : 'inbound visibility not reported';
      return `Visible settings reviewed, ${seen}, simulated test unsuccessful; root cause unknown. Suggest specialist review of routing/execution.`;
    }
    case 'retest-failed': return 'Unknown. The simulated test still didn\'t produce the expected reply after the suggested check.';
    case 'not-confirmed': return 'Unknown. The simulated test showed the expected reply, but the customer reports it isn\'t working (or isn\'t sure).';
    default: return 'Unknown. Help was requested before the checks were finished.';
  }
}

export function ruleChanges(state) {
  const was = SCENARIOS[state.scenarioId].rule;
  const now = state.rule;
  const out = [];
  if (now.keyword !== was.keyword) out.push(['Keyword', [code(was.keyword), ' → ', code(now.keyword)]]);
  if (now.action !== was.action) out.push(['Action', [ACTION_LABELS[was.action], ' → ', strong(ACTION_LABELS[now.action])]]);
  if (now.replyText !== was.replyText) out.push(['Reply text', ['Updated']]);
  return out;
}

const plain = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.code ?? p.strong)).join('');

export function buildSummary(state) {
  const [headline, sub] = HANDOFF[state.escalation?.reason] ?? HANDOFF.manual;
  const a = state.answers;
  const was = SCENARIOS[state.scenarioId].rule;
  const r = state.rule;
  const changedNote = (key) => (r[key] !== was[key] ? ` (changed in demo from ${key === 'action' ? ACTION_LABELS[was[key]] : was[key]})` : '');

  const config = [
    ['Rule', r.name],
    ['Keyword', r.keyword + changedNote('keyword')],
    ['Match', 'Exact (case-sensitive)'],
    ['Action', ACTION_LABELS[r.action] + changedNote('action')],
    ...(r.action === 'textReply' ? [['Reply text', `"${r.replyText}"${r.replyText !== was.replyText ? ' (changed in demo)' : ''}`]] : []),
    ['Status', r.active ? 'Active' : 'Paused'],
  ];

  const reported = [];
  if (a.symptom) reported.push(['What happened', SYMPTOM_LABELS[a.symptom]]);
  if (a.inbound) reported.push(['Test message visible in Team Inbox', inboxLabel(a)]);
  const ticked = INBOX_CHECKS.filter((c) => a.inboxChecks?.[c.id]).map((c) => c.label);
  if (ticked.length) reported.push(['Inbox checks done', ticked.join('; ')]);
  if (a.testText !== undefined) reported.push(['Test message sent', `"${a.testText}"`]);
  if (a.expected) reported.push(['Expected outcome', EXPECTED_LABELS[a.expected]]);
  if (a.confirm) reported.push(['Result after simulated test', CONFIRM_LABELS[a.confirm]]);
  if (!reported.length) reported.push(['Answers', 'None yet: help was requested at the first question']);

  const visited = new Set([...state.history, state.step]);
  const checks = [];
  if (a.inboxResult) checks.push(['Quick Inbox check', { found: 'Message found', missing: 'Still missing', 'no-access': "Couldn't access Inbox" }[a.inboxResult]]);
  if (a.comparison) {
    const before = a.comparison.keyword !== r.keyword ? ` (checked against ${a.comparison.keyword}, before the demo edit)` : '';
    checks.push(['Test message vs keyword (exact match)', COMPARISON_LABELS[a.comparison.kind] + before]);
  }
  if (visited.has('action-check')) checks.push(['Rule action reviewed', 'Yes']);
  for (const [field, parts] of ruleChanges(state)) checks.push([`Demo edit saved: ${field}`, plain(parts)]);
  if (state.saved?.what === 'test') checks.push(['Demo test message changed', `"${state.saved.from}" → "${state.saved.to}"`]);
  if (state.sim) checks.push(['Simulated test (no real message sent)', SIM_LABELS[state.sim.reason]]);
  if (!checks.length) checks.push(['Checks', 'None finished yet']);

  const cause = causeOf(state);
  const sections = [
    { title: 'Demo configuration', items: config },
    { title: 'User reported', items: reported },
    { title: 'Checks in this guide', items: checks },
  ];
  const text = [
    'Keyword auto-reply not working: support summary',
    'Prepared with Cheerio Troubleshoot (interactive concept, demo data)',
    '',
    headline,
    ...sections.flatMap((s) => ['', s.title.toUpperCase(), ...s.items.map(([k, v]) => `- ${k}: ${v}`)]),
    '',
    'CAUSE',
    cause,
    '',
    'Note: nothing here was checked on a live account. Tests were simulated, no WhatsApp messages were sent, and no support ticket was created.',
  ].join('\n');

  return { headline, sub, sections, cause, text };
}

export function mailtoHref(state) {
  const subject = `Keyword auto-reply not working: ${state.rule.name}`;
  const body = buildSummary(state).text.replace(/\n/g, '\r\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
