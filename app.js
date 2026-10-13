// UI shell: draws the keyword workspace and the troubleshooting drawer from flow.js state,
// and turns clicks into flow actions. All branching lives in flow.js.
import {
  SCENARIOS, ACTION_LABELS, SYMPTOMS, INBOX_CHECKS, EXPECTED_OPTIONS, SUPPORT_EMAIL,
  createState, reduce, currentComparison, explainComparison, explainSimFailure, explainSaved, testTextOf, canRetry,
  ruleChanges, buildSummary, mailtoHref,
} from './flow.js';

let state = createState();
// View-only state that the flow doesn't need to know about.
const ui = { confirmRestart: false, copy: null, draft: null, trigger: null, announced: '' };

const $ = (sel) => document.querySelector(sel);
const drawer = $('#drawer');
const bodyEl = $('#drawer-body');
const footEl = $('#drawer-foot');
const scenarioSel = $('#scenario');
const menuBtn = $('#menu-btn');

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Exact match counts spaces, so make leading/trailing ones visible.
const showSpaces = (v) => v.replace(/^ +| +$/g, (m) => '␣'.repeat(m.length));
const codeHtml = (v) => `<code class="val">${esc(showSpaces(v))}</code>`;
const rich = (parts) => parts.map((p) => (typeof p === 'string' ? esc(p) : 'code' in p ? codeHtml(p.code) : `<strong>${esc(p.strong)}</strong>`)).join('');
const icon = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function dispatch(action) {
  state = reduce(state, action);
  ui.copy = null;
  ui.confirmRestart = false;
  render();
}

function render() {
  renderTable();
  scenarioSel.value = state.scenarioId;
  renderDrawer();
}

// ---- Keywords table -------------------------------------------------------

// Static context rows; only "Pricing reply" is part of the demo.
const OTHER_RULES = [
  ['Store hours', ['HOURS', 'timings'], 'Exact', 'Text reply', true],
  ['Order tracking', ['TRACK', 'order status'], 'Approximate', 'Workflow', true],
  ['Talk to a person', ['HUMAN', 'agent'], 'Exact', 'Assign to agent', true],
  ['Festive sale', ['SALE'], 'Exact', 'Template', false],
];
const SHORT_ACTION = { textReply: 'Text reply', assignAgent: 'Assign to agent' };

let tableKey = '';
function renderTable() {
  const key = JSON.stringify([state.scenarioId, state.rule]);
  if (key === tableKey) return;
  tableKey = key;
  const r = state.rule;
  const row = (name, keywords, match, action, on, extra = '', focus = false) => `
    <tr class="${focus ? 'is-focus' : ''}">
      <td data-label="Rule">
        <span class="rule-name"><span>${esc(name)}</span>${extra}</span>
        <span class="chips"><span class="sr-only">Keywords: </span>${keywords.map((k) => `<span class="chip">${esc(showSpaces(k))}</span>`).join('')}</span>
      </td>
      <td data-label="Matching">${match}</td>
      <td data-label="Reply action"><span class="pill">${action}</span></td>
      <td data-label="Status"><span class="status${on ? ' is-on' : ''}"><span class="status-dot" aria-hidden="true"></span>${on ? 'Active' : 'Paused'}</span></td>
      <td class="cell-action">${focus ? `<button type="button" class="btn btn-secondary btn-sm" data-open>${icon('wrench', 'ico-sm')}Troubleshoot<span class="sr-only"> ${esc(name)}</span></button>` : ''}</td>
    </tr>`;
  const edited = ruleChanges(state).length ? '<span class="tag tag-edited">Edited in demo</span>' : '';
  $('#rules-body').innerHTML = row(r.name, [r.keyword], 'Exact', SHORT_ACTION[r.action], r.active, edited, true)
    + OTHER_RULES.map((o) => row(...o)).join('');
}

// ---- Drawer shell (reusable for other issue types) --------------------------

const STAGES = ['Describe', 'Check', 'Fix', 'Test'];
const STAGE_OF = { symptom: 0, 'inbox-check': 1, 'inbox-recovery': 1, 'keyword-check': 1, 'action-check': 1, 'rule-edit': 2, retest: 3, success: 4 };

let shownStep = null;
function renderDrawer() {
  if (!state.open) {
    if (shownStep !== null) {
      if (drawer.open) drawer.close();
      (ui.trigger?.isConnected ? ui.trigger : $('#rules-body [data-open]'))?.focus();
      shownStep = null;
    }
    return;
  }
  const stepChanged = shownStep !== state.step;
  const active = document.activeElement;
  const focusKey = focusKeyOf(active);
  const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  if (stepChanged && state.step === 'rule-edit') ui.draft = { keyword: state.rule.keyword, action: state.rule.action, replyText: state.rule.replyText };
  if (!drawer.open) drawer.showModal();

  renderStages();
  bodyEl.innerHTML = (ui.confirmRestart ? restartConfirm() : '') + VIEWS[state.step]();
  renderFoot();
  shownStep = state.step;

  if (stepChanged) {
    bodyEl.scrollTop = 0;
    $('#step-title').focus({ preventScroll: true });
  } else if (!active?.isConnected) {
    const el = (focusKey && drawer.querySelector(focusKey)) || bodyEl.querySelector('[data-announce]') || $('#step-title');
    el.focus({ preventScroll: true });
    if (selection && el.setSelectionRange) try { el.setSelectionRange(...selection); } catch { /* not a text field */ }
  }
  announce();
}

function focusKeyOf(el) {
  if (!el || !bodyEl.contains(el) && !footEl.contains(el)) return null;
  if (el.id) return `#${el.id}`;
  const { action, value } = el.dataset;
  return action ? `[data-action="${action}"]${value ? `[data-value="${value}"]` : ''}` : null;
}

// Results appear without a page change, so read them out and bring them into view.
function announce() {
  const el = bodyEl.querySelector('[data-announce]');
  const text = el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
  if (text && text !== ui.announced) {
    $('#announcer').textContent = text;
    el.scrollIntoView({ block: 'nearest' });
  }
  ui.announced = text;
}

function renderStages() {
  const el = $('#stages');
  if (state.step === 'escalation') {
    el.innerHTML = `<li class="stage-help">${icon('lifebuoy', 'ico-sm')}Human help: summary ready</li>`;
    return;
  }
  const cur = STAGE_OF[state.step];
  const seen = new Set([...state.history, state.step].map((s) => STAGE_OF[s]));
  el.innerHTML = STAGES.map((label, i) => {
    const cls = i === cur ? 'is-current' : i > cur ? '' : seen.has(i) ? 'is-done' : 'is-skipped';
    return `<li class="stage ${cls}"${i === cur ? ' aria-current="step"' : ''}>
      <span class="stage-dot" aria-hidden="true">${cls === 'is-done' ? icon('check', 'ico-xs') : i + 1}</span>${label}${cls === 'is-skipped' ? '<span class="sr-only"> (not needed)</span>' : cls === 'is-done' ? '<span class="sr-only"> (done)</span>' : ''}
    </li>`;
  }).join('');
}

function renderFoot() {
  if (state.step === 'escalation') { footEl.innerHTML = ''; return; }
  const back = state.history.length && state.step !== 'success'
    ? `<button type="button" class="btn btn-ghost" data-action="back">${icon('arrow-left', 'ico-sm')}Back</button>` : '<span></span>';
  footEl.innerHTML = `${back}<button type="button" class="btn btn-help" data-action="escalate">${icon('lifebuoy', 'ico-sm')}Get human help</button>`;
}

function restartConfirm() {
  const edits = ruleChanges(state).map(([k, parts]) => `${k.toLowerCase()} ${rich(parts)}`).join(', ');
  return `
    <div class="callout callout-warn" role="group" aria-labelledby="restart-title">
      ${icon('rotate')}
      <div>
        <p class="callout-title" id="restart-title">Start over?</p>
        <p>This undoes your demo edit (${edits}) and clears your answers.</p>
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-sm" data-ui="confirmRestart">Start over</button>
          <button type="button" class="btn btn-ghost btn-sm" data-ui="cancelRestart">Keep going</button>
        </div>
      </div>
    </div>`;
}

// ---- Small view helpers ---------------------------------------------------

const title = (text) => `<h3 class="step-title" id="step-title" tabindex="-1">${text}</h3>`;
const why = (html) => `<p class="why">${icon('info', 'ico-sm')}<span>${html}</span></p>`;
const choice = (type, value, label, { hint = '', selected = false } = {}) => `
  <button type="button" class="choice${selected ? ' is-selected' : ''}" data-action="${type}" data-value="${value}">
    <span class="choice-text">
      <span class="choice-label">${esc(label)}</span>
      ${hint ? `<span class="choice-hint">${esc(hint)}</span>` : ''}
      ${selected ? '<span class="sr-only">(your earlier answer)</span>' : ''}
    </span>
    ${icon(selected ? 'check' : 'chevron-right', 'choice-ico')}
  </button>`;
const callout = (kind, ic, titleHtml, bodyHtml = '', attrs = '') => `
  <div class="callout callout-${kind}" ${attrs}>${icon(ic)}<div>${titleHtml ? `<p class="callout-title">${titleHtml}</p>` : ''}${bodyHtml}</div></div>`;
const result = (kind, ic, titleHtml, bodyHtml) => callout(kind, ic, titleHtml, bodyHtml, 'data-announce tabindex="-1"');
const btn = (type, label, { value, kind = 'primary', ic, block = true } = {}) => `
  <button type="button" class="btn btn-${kind}${block ? ' btn-block' : ''}" data-action="${type}"${value ? ` data-value="${value}"` : ''}>${ic ? icon(ic, 'ico-sm') : ''}${label}</button>`;
const snapshot = (rows, label = 'Demo rule snapshot') => `
  <div class="snapshot">
    <div class="snapshot-head">${icon('key', 'ico-sm')}<span>${esc(state.rule.name)}</span><span class="tag tag-demo">${label}</span></div>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
  </div>`;

// ---- Steps for the keyword auto-reply guide --------------------------------

const VIEWS = {
  symptom() {
    const a = state.answers;
    return `
      <p class="lead">Let's find out why your WhatsApp auto-reply didn't respond.</p>
      ${title('What happened when you tested the reply?')}
      <div class="choices">${SYMPTOMS.map((o) => choice('symptom', o.value, o.label, { hint: o.hint, selected: a.symptom === o.value })).join('')}</div>
      ${a.symptom === 'unsure' ? result('info', 'info', "Here's how to check",
        `<p>Send the keyword from a personal WhatsApp number to your business number. Then open Team Inbox, find that chat and see whether an automatic reply was sent.</p>
         <p>Then pick the option above that matches what you saw. Still not sure? Choose “I'm not sure” again and we'll prepare a summary for support.</p>`) : ''}
      <div class="escape">
        <span>Is this keyword part of a bigger automation?</span>
        <button type="button" class="link-btn" data-action="symptom" data-value="complex">My setup uses a complex workflow or AI assistant</button>
      </div>`;
  },

  'inbox-check'() {
    const v = state.answers.inbound;
    return `
      ${title('Can you see your test message in Team Inbox?')}
      ${why('If the message never reached your Inbox, the keyword rule had nothing to respond to. Your answer tells us where to look next.')}
      <div class="choices choices-3">
        ${choice('inbound', 'yes', 'Yes, I can see it', { selected: v === 'yes' })}
        ${choice('inbound', 'no', 'No', { selected: v === 'no' })}
        ${choice('inbound', 'unsure', "I'm not sure", { selected: v === 'unsure' })}
      </div>
      <p class="fineprint">${icon('user', 'ico-sm')}<span>Saved as <strong>user reported</strong>. This guide can't look inside your account.</span></p>`;
  },

  'inbox-recovery'() {
    const a = state.answers;
    return `
      ${title("Let's take a quick look in Team Inbox")}
      ${why("If the message isn't visible in Inbox, checking the keyword isn't enough to diagnose this. These checks catch the most common mix-ups.")}
      <fieldset class="checklist">
        <legend>Tick what you've checked <span class="muted">(optional)</span></legend>
        ${INBOX_CHECKS.map((c) => `
          <label class="check">
            <input type="checkbox" data-action="inboxCheck" data-value="${c.id}"${a.inboxChecks?.[c.id] ? ' checked' : ''}>
            <span>${esc(c.label)}</span>
          </label>`).join('')}
      </fieldset>
      <p class="q">Can you find your test message now?</p>
      <div class="choices">
        ${choice('inboxResult', 'found', 'Found it now', { hint: 'Continue to the keyword check.', selected: a.inboxResult === 'found' })}
        ${choice('inboxResult', 'missing', 'Still missing', { hint: "We'll prepare a summary for support.", selected: a.inboxResult === 'missing' })}
        ${choice('inboxResult', 'no-access', "I can't access Inbox", { hint: 'Your account admin or support can help.', selected: a.inboxResult === 'no-access' })}
      </div>`;
  },

  'keyword-check'() {
    const a = state.answers;
    const r = state.rule;
    const kind = currentComparison(state);
    const res = kind && explainComparison(kind, a.testText, r.keyword);
    let outcome = '';
    if (res?.ok) {
      outcome = result('ok', 'check-circle', rich(res.title), `<p>${rich(res.body)}</p>`)
        + btn('toActionCheck', `Next: check what the rule does ${icon('arrow-right', 'ico-sm')}`);
    } else if (res) {
      outcome = result('warn', 'alert', rich(res.title), `<p>${rich(res.body)}</p><p class="muted small">This is a possible explanation for the missing reply, not a confirmed cause.</p>`)
        + btn('editRule', 'Review keyword settings', { value: 'keyword', ic: 'pencil' });
    }
    return `
      ${title('What did you send in your test message?')}
      ${why('Exact match only triggers when the whole message is exactly the keyword, letter for letter.')}
      ${snapshot([['Keyword', codeHtml(r.keyword)], ['Matching', 'Exact <span class="muted">(case-sensitive)</span>']])}
      <form class="field" data-form="compare" novalidate>
        <label for="test-text">Your test message, exactly as you typed it</label>
        <div class="input-row">
          <input id="test-text" class="input mono" value="${esc(testTextOf(state))}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"${state.error ? ' aria-invalid="true" aria-describedby="test-text-error"' : ''}>
          <button type="submit" class="btn btn-primary" id="compare-btn">Compare with rule</button>
        </div>
        ${state.error ? `<p class="error" id="test-text-error">${esc(state.error)}</p>` : ''}
      </form>
      ${outcome}`;
  },

  'action-check'() {
    const a = state.answers;
    const r = state.rule;
    const config = snapshot([
      ['Keyword', codeHtml(r.keyword)],
      ['Matching', 'Exact'],
      ['Action', `<strong>${ACTION_LABELS[r.action]}</strong>`],
      ...(r.action === 'textReply' ? [['Reply text', `“${esc(r.replyText)}”`]] : []),
    ], 'Demo configuration');

    if (a.symptom === 'different-action') {
      return `
        ${title('What did you expect to happen?')}
        ${why(`Here's what this rule is set to do when someone sends ${codeHtml(r.keyword)}. Compare it with the result you wanted.`)}
        ${config}
        <div class="choices">${EXPECTED_OPTIONS.map((o) => choice('expected', o.value, o.label, { selected: a.expected === o.value })).join('')}</div>
        ${a.expected ? expectationResult(a.expected, r) : ''}`;
    }
    if (r.action !== 'textReply') {
      return `
        ${title('Check what the rule does')}
        ${config}
        ${result('warn', 'alert', 'This rule assigns the chat instead of replying.',
          `<p>Assigning a chat to a teammate isn't the same as sending an automatic text reply. That would explain why no reply arrived in this demo.</p>
           <p class="muted small">This is a possible explanation, not a confirmed cause.</p>`)}
        <div class="btn-col">
          ${btn('editRule', 'Review action setting', { value: 'action', ic: 'pencil' })}
          ${btn('escalate', 'We assign these chats on purpose: get help', { value: 'routing', kind: 'secondary' })}
        </div>`;
    }
    return `
      ${title("The visible settings don't explain the missing reply")}
      ${config}
      <ul class="ticks">
        ${currentComparison(state) === 'match' ? `<li>${icon('check', 'ico-sm')}Your test message matches the keyword exactly</li>` : ''}
        ${r.active ? `<li>${icon('check', 'ico-sm')}The rule is Active</li>` : ''}
        <li>${icon('check', 'ico-sm')}The action is “${ACTION_LABELS.textReply}”</li>
      </ul>
      <p>Next, run a controlled simulated check. If it still doesn't work, a specialist can look deeper.</p>
      <div class="btn-col">
        ${btn('toRetest', 'Run simulated test', { ic: 'play' })}
        ${btn('escalate', 'Get human help instead', { kind: 'secondary', ic: 'lifebuoy' })}
      </div>`;
  },

  'rule-edit'() {
    const r = state.rule;
    const d = ui.draft;
    const isAction = state.editMode === 'action';
    const sent = testTextOf(state).trim();
    const suggestion = !isAction && sent && sent !== d.keyword ? sent : '';
    const fields = isAction ? `
        <fieldset class="radios">
          <legend>When a message matches ${codeHtml(r.keyword)}</legend>
          ${Object.entries(ACTION_LABELS).map(([value, label]) => `
            <label class="radio"><input type="radio" name="action" value="${value}"${d.action === value ? ' checked' : ''}><span>${label}</span></label>`).join('')}
        </fieldset>
        <div class="reply-field"${d.action === 'textReply' ? '' : ' hidden'}>
          <label for="reply-text">Reply text</label>
          <textarea id="reply-text" name="replyText" class="input" rows="3">${esc(d.replyText)}</textarea>
        </div>` : `
        <label for="kw">Keyword</label>
        <input id="kw" name="keyword" class="input mono" value="${esc(d.keyword)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="kw-hint">
        <p class="hint" id="kw-hint">Exact match is case-sensitive. Customers often type in lowercase.</p>
        ${suggestion ? `<button type="button" class="suggest" data-fill="kw" data-text="${esc(suggestion)}">Use ${codeHtml(suggestion)} (what you sent)</button>` : ''}
        <dl class="kv"><dt>Matching</dt><dd>Exact (case-sensitive)</dd><dt>Action</dt><dd>${ACTION_LABELS[r.action]}</dd></dl>`;
    const mismatch = !isAction && ![undefined, 'match'].includes(currentComparison(state));
    return `
      ${title(isAction ? 'Review action setting' : 'Review keyword settings')}
      ${callout('note', 'alert', '', '<p>Changing this rule may affect other messages that use it. <strong>This is demo data only.</strong> No real account is changed.</p>')}
      <form class="editor" data-form="save" novalidate>
        <div class="editor-head"><span>${esc(r.name)}</span><span class="tag tag-demo">Demo rule editor</span></div>
        ${fields}
        ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ''}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary" id="save-btn">${icon('check', 'ico-sm')}Save demo change</button>
          ${btn('cancelEdit', 'Cancel', { kind: 'ghost', block: false })}
        </div>
      </form>
      ${mismatch ? `
        <div class="alt">
          <p><strong>Or keep the rule</strong> and test with ${codeHtml(r.keyword)} instead. This only helps if your customers type exactly ${codeHtml(r.keyword)}.</p>
          ${btn('useKeywordAsTest', `Test with ${esc(r.keyword)}`, { kind: 'secondary', block: false })}
        </div>` : ''}
      <button type="button" class="link-btn link-quiet" data-action="escalate" data-value="no-permission">${icon('lock', 'ico-sm')}I can't edit this rule</button>`;
  },

  retest() {
    const r = state.rule;
    return `
      ${state.saved ? callout('ok', 'check-circle', '', `<p>${rich(explainSaved(state.saved))}</p>`) : ''}
      ${title('Run a simulated test')}
      <p class="sim-label">${icon('flask', 'ico-sm')}Demo simulation. No real WhatsApp message is sent.</p>
      ${snapshot([['Test message', codeHtml(testTextOf(state))], ['Rule', `${codeHtml(r.keyword)} · Exact · ${ACTION_LABELS[r.action]}`]], 'Current demo setup')}
      ${state.sim ? simResult(state.sim) : btn('runSim', 'Run simulated test', { ic: 'play' })}`;
  },

  success() {
    const changes = ruleChanges(state);
    return `
      <div class="outcome outcome-ok">
        <span class="outcome-icon">${icon('check-circle')}</span>
        ${title('Expected reply confirmed in this demo.')}
        <p>You confirmed that the simulated reply looked right.</p>
      </div>
      <section class="panel">
        <h4>What changed in the demo rule</h4>
        ${changes.length
          ? `<dl class="kv">${changes.map(([k, parts]) => `<dt>${k}</dt><dd>${rich(parts)}</dd>`).join('')}</dl>`
          : '<p class="muted">Nothing. The rule already matched your test message.</p>'}
      </section>
      ${callout('info', 'info', 'Check it for real', '<p>In real use, success has to be checked on your connected WhatsApp number: send the keyword from a personal number and look for the reply.</p>')}
      <div class="btn-col">
        ${btn('close', 'Back to keywords', { ic: 'arrow-left' })}
        ${btn('anotherCheck', 'Start another check', { kind: 'secondary' })}
      </div>`;
  },

  escalation() {
    const sum = buildSummary(state);
    const tags = { 'Demo configuration': ['tag-demo', 'Demo data'], 'User reported': ['tag-user', 'User reported'], 'Checks in this guide': ['tag-guide', 'This guide'] };
    return `
      <div class="outcome outcome-help">
        <span class="outcome-icon">${icon('lifebuoy')}</span>
        ${title(esc(sum.headline))}
        ${sum.sub ? `<p>${esc(sum.sub)}</p>` : ''}
      </div>
      <p class="lead">You don't need to repeat everything. Here's a summary you can share with support.</p>
      <article class="summary" aria-label="Support summary">
        ${sum.sections.map((sec) => `
          <section>
            <h4>${sec.title}<span class="tag ${tags[sec.title][0]}">${tags[sec.title][1]}</span></h4>
            <dl class="kv">${sec.items.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
          </section>`).join('')}
        <section class="cause"><h4>Cause</h4><p>${esc(sum.cause)}</p></section>
      </article>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-action="copy">${icon(ui.copy === 'copied' ? 'check' : 'copy', 'ico-sm')}${ui.copy === 'copied' ? 'Copied' : 'Copy summary'}</button>
        <a class="btn btn-secondary" href="${esc(mailtoHref(state))}">${icon('mail', 'ico-sm')}Email support</a>
      </div>
      ${ui.copy === 'failed' ? `
        <div class="copy-fallback">
          <p class="error" role="alert">Couldn't copy automatically. The summary is selected below: press Ctrl+C (⌘C on Mac) to copy it.</p>
          <label class="sr-only" for="copy-text">Summary text</label>
          <textarea id="copy-text" class="input" rows="10" readonly>${esc(sum.text)}</textarea>
        </div>` : ''}
      <p class="fineprint">${icon('info', 'ico-sm')}<span>Email support opens your own email app with this summary, addressed to ${SUPPORT_EMAIL}, for you to review and send. Nothing is sent from here and no ticket is created.</span></p>
      <div class="btn-row">
        ${btn('back', 'Return to troubleshooting', { kind: 'ghost', ic: 'arrow-left', block: false })}
        ${btn('close', 'Back to keywords', { kind: 'ghost', block: false })}
      </div>`;
  },
};

function expectationResult(expected, r) {
  const help = btn('escalate', 'Get human help', { value: 'routing', ic: 'lifebuoy' });
  if (expected === 'text' && r.action !== 'textReply') {
    return result('warn', 'alert', 'This rule assigns the chat to a teammate.',
      "<p>Assigning a chat to a person isn't the same as sending an automatic text reply. That would explain what you saw in this demo.</p>")
      + btn('editRule', 'Review action setting', { value: 'action', ic: 'pencil' });
  }
  if (expected === 'text') {
    return result('info', 'info', 'This rule is already set to send a text reply.',
      "<p>If you saw something different, another automation may have responded instead. This guide can't check other automations.</p>")
      + `<div class="btn-col">${btn('toRetest', 'Run simulated test of this rule', { ic: 'play' })}${btn('escalate', 'Get human help', { value: 'routing', kind: 'secondary', ic: 'lifebuoy' })}</div>`;
  }
  if (expected === 'assign' && r.action === 'assignAgent') {
    return result('info', 'info', 'This rule already assigns the chat, as you expected.',
      '<p>If something else happened, a specialist should look at how your chats are routed.</p>') + help;
  }
  if (expected === 'assign') {
    return result('info', 'info', 'This rule sends a text reply rather than assigning the chat.',
      "<p>Changing how chats are routed can affect your other automations, so it's best to check with support first.</p>") + help;
  }
  return result('info', 'info', 'No problem. How chats are handled is a business decision.',
    '<p>Support can help you decide without changing your other automations.</p>') + help;
}

function simResult(sim) {
  const chat = `
    <figure class="wa">
      <figcaption class="wa-cap">${icon('flask', 'ico-sm')}Simulated demo — not a real message</figcaption>
      <div class="wa-body">
        <div class="bubble bubble-in"><p>${esc(sim.input)}</p><span class="bubble-meta">Customer · simulated demo, not a real message</span></div>
        ${sim.replied
          ? `<div class="bubble bubble-out"><p>${esc(sim.reply)}</p><span class="bubble-meta">Auto-reply · simulated demo, not a real message</span></div>`
          : '<p class="wa-note">No reply in this simulation</p>'}
      </div>
    </figure>`;
  if (sim.replied) {
    return `${chat}
      <div class="choices-block" data-announce tabindex="-1">
        <p class="q">This demo now shows the expected response. Did you get the result you wanted?</p>
      </div>
      <div class="choices choices-3">
        ${choice('confirm', 'yes', 'Yes, in this demo')}
        ${choice('confirm', 'no', 'No, still not working')}
        ${choice('confirm', 'unsure', 'Not sure')}
      </div>`;
  }
  const fixable = ['no-match', 'not-text-reply'].includes(sim.reason) && canRetry(state);
  const fixKeyword = sim.reason === 'no-match';
  return `${chat}
    ${result('warn', 'alert', 'No expected reply in this simulated setup.', `<p>${rich(explainSimFailure(sim, state.rule))}</p>`)}
    <div class="btn-col">
      ${fixable ? btn('editRule', fixKeyword ? 'Review keyword settings' : 'Review action setting', { value: fixKeyword ? 'keyword' : 'action', kind: 'secondary', ic: 'pencil' }) : ''}
      ${btn('escalate', 'Get human help', { value: sim.reason === 'unresolved' ? 'unresolved' : 'retest-failed', ic: 'lifebuoy' })}
    </div>`;
}

// ---- Events ----------------------------------------------------------------

const PARAM = { editRule: 'mode', escalate: 'reason' };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-open], [data-action], [data-ui], [data-fill]');
  if (!el || el.matches('input')) return; // checkboxes are handled on change
  if (el.hasAttribute('data-open')) {
    ui.trigger = el;
    closeNav();
    dispatch({ type: 'open' });
  } else if (el.dataset.fill) {
    const input = document.getElementById(el.dataset.fill);
    input.value = ui.draft.keyword = el.dataset.text;
    input.focus();
  } else if (el.dataset.ui) {
    uiAction(el.dataset.ui);
  } else if (el.dataset.action === 'copy') {
    copySummary();
  } else {
    const { action: type, value } = el.dataset;
    dispatch(value === undefined ? { type } : { type, [PARAM[type] ?? 'value']: value });
  }
});

function uiAction(name) {
  if (name === 'startOver' && ruleChanges(state).length) {
    ui.confirmRestart = true;
    render();
    $('[data-ui="confirmRestart"]').focus();
  } else if (name === 'startOver' || name === 'confirmRestart') {
    dispatch({ type: 'startOver' });
  } else if (name === 'cancelRestart') {
    ui.confirmRestart = false;
    render();
    $('[data-ui="startOver"]').focus();
  }
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText(buildSummary(state).text);
    ui.copy = 'copied';
    $('#announcer').textContent = 'Summary copied.';
  } catch {
    ui.copy = 'failed';
  }
  render();
  if (ui.copy === 'failed') {
    $('#copy-text').focus();
    $('#copy-text').select();
  }
}

drawer.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'test-text') {
    const stale = state.answers.comparison || state.error;
    state = reduce(state, { type: 'testText', value: t.value });
    if (stale) render(); // drop the comparison that no longer matches the text
  } else if (t.form?.dataset.form === 'save' && t.name) {
    ui.draft[t.name] = t.value;
    if (t.name === 'action') t.form.querySelector('.reply-field').hidden = t.value !== 'textReply';
  }
});

drawer.addEventListener('change', (e) => {
  if (e.target.type === 'checkbox') dispatch({ type: 'inboxCheck', id: e.target.dataset.value });
});

drawer.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.dataset.form === 'compare') dispatch({ type: 'compare' });
  if (e.target.dataset.form === 'save') {
    const d = ui.draft;
    dispatch({ type: 'saveRule', patch: state.editMode === 'action' ? { action: d.action, replyText: d.replyText } : { keyword: d.keyword } });
  }
});

// Esc and backdrop clicks close the drawer; answers stay so it can be resumed.
// The close event is async (and delayed in background tabs), so a late one can arrive after
// the drawer was reopened: only sync when the dialog really is closed.
drawer.addEventListener('close', () => { if (state.open && !drawer.open) dispatch({ type: 'close' }); });
drawer.addEventListener('click', (e) => { if (e.target === drawer) dispatch({ type: 'close' }); });

function setStatus(prefix = '') {
  $('#proto-status').textContent = `${prefix}${SCENARIOS[state.scenarioId].hint}`;
}
scenarioSel.innerHTML = Object.entries(SCENARIOS).map(([id, s]) => `<option value="${id}">${esc(s.label)}</option>`).join('');
scenarioSel.addEventListener('change', () => {
  dispatch({ type: 'scenario', id: scenarioSel.value });
  setStatus('Scenario loaded, demo reset. ');
});
$('#reset-demo').addEventListener('click', () => {
  dispatch({ type: 'reset' });
  setStatus('Demo reset. ');
});

function closeNav() {
  document.body.classList.remove('nav-open');
  menuBtn.setAttribute('aria-expanded', 'false');
}
menuBtn.addEventListener('click', () => {
  menuBtn.setAttribute('aria-expanded', String(document.body.classList.toggle('nav-open')));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
document.addEventListener('click', (e) => {
  if (document.body.classList.contains('nav-open') && !e.target.closest('#sidebar, #menu-btn')) closeNav();
});
$('#sidebar').addEventListener('click', (e) => { if (e.target.closest('a')) closeNav(); });

render();
setStatus();
