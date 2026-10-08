const starters = [
  { icon: '↗', label: 'Experience or stipend', text: 'I’m choosing between an internship that pays a stipend and one that may offer better experience. I’m confused about which matters more for me. How should I decide?' },
  { icon: '◌', label: 'Choosing an internship', text: 'I found an unpaid internship with good learning opportunities, but I need income. I’m unsure whether to take it or look for paid work. What should I consider as I decide?' },
  { icon: '⌂', label: 'Family expectations', text: 'I want to make my own choice, but my family has different expectations. I’m not sure how to balance what I want with what they want. How should I decide?' },
  { icon: '✳', label: 'A new opportunity', text: 'A new opportunity has come up, and I’m unsure whether to take it. How can I figure out if it’s the right choice for me?' },
  { icon: '◷', label: 'Where my time goes', text: 'I have several things competing for my time, and I’m confused about what to prioritize. How should I decide what gets my time?' }
];
const maxThinkQuestions = 6;
const conversationStorageKey = 'decisionmate-saved-conversations-v1';
const homeView = document.querySelector('#homeView');
const sessionView = document.querySelector('#sessionView');
const resultView = document.querySelector('#resultView');
const dilemmaInput = document.querySelector('#dilemmaInput');
const answerInput = document.querySelector('#answerInput');
const chatMessages = document.querySelector('#chatMessages');
const composerWrap = document.querySelector('#composerWrap');
const state = { dilemma: '', answers: [], stage: 'think', thinkIndex: 0, decision: '', reflection: '', userMessages: [], sessionId: '', groupId: '', parentId: null, previousContext: '', viewingSaved: false, pending: false, requestId: 0, abortController: null };

const toneSignals = {
  overwhelmed: { label: 'Overwhelmed or under pressure', terms: ['overwhelmed', 'too much', 'can’t cope', "can't cope", 'cannot cope', 'exhausted', 'burnt out', 'burned out', 'pressure', 'stressed', 'stressful', 'panic', 'panicking'] },
  frustrated: { label: 'Frustrated', terms: ['frustrated', 'annoyed', 'angry', 'furious', 'unfair', 'fed up', 'irritated', 'upset', 'resent'] },
  low: { label: 'Low or discouraged', terms: ['sad', 'lonely', 'hopeless', 'disappointed', 'discouraged', 'heartbroken', 'guilty', 'ashamed', 'worthless', 'down'] },
  uncertain: { label: 'Uncertain or worried', terms: ['worried', 'worry', 'anxious', 'nervous', 'afraid', 'scared', 'uncertain', 'confused', 'stuck', 'unsure', 'doubt', 'what if'] },
  hopeful: { label: 'Hopeful or excited', terms: ['excited', 'hopeful', 'looking forward', 'happy', 'relieved', 'proud', 'optimistic', 'confident', 'glad', 'eager'] },
  calm: { label: 'Calm or reflective', terms: ['calm', 'at peace', 'clear now', 'comfortable', 'ready', 'accept', 'makes sense', 'thoughtful', 'okay with'] }
};
function updateTone(messages = state.userMessages, applyToSession = true) {
  const recentFirst = [...messages].reverse();
  const scores = Object.fromEntries(Object.keys(toneSignals).map(key => [key, 0]));
  recentFirst.forEach((message, age) => {
    const text = message.toLowerCase();
    const weight = 1 / (1 + age * .28);
    for (const [mood, signal] of Object.entries(toneSignals)) {
      for (const term of signal.terms) {
        if (text.includes(term)) scores[mood] += weight * (term.includes(' ') ? 1.35 : 1);
      }
    }
  });
  const ranked = Object.entries(scores).sort((a,b) => b[1] - a[1]);
  let mood = ranked[0][1] > 0 ? ranked[0][0] : 'mixed';
  if (ranked[0][1] > 0 && ranked[1][1] >= ranked[0][1] * .72) mood = 'mixed';
  const labels = { mixed: 'Mixed or still taking shape', ...Object.fromEntries(Object.entries(toneSignals).map(([key, value]) => [key, value.label])) };
  if (applyToSession) {
    sessionView.dataset.tone = mood;
    document.querySelector('#toneLabel').textContent = labels[mood];
  }
  return mood;
}
function showEmotionReaction(message, mood) {
  message.querySelector('.emotion-reaction')?.remove();
  const reactions = { mixed: ['🤔', 'Thinking it through'], overwhelmed: ['🫶', 'One step at a time'], frustrated: ['🌿', 'Take a breath'], low: ['💛', 'You’re not alone'], uncertain: ['🤔', 'No rush to know'], hopeful: ['✨', 'Hold on to that'], calm: ['🌼', 'A thoughtful pause'], decided: ['😊', 'You made your decision'] };
  const [emoji, messageText] = reactions[mood] || reactions.mixed;
  const reaction = document.createElement('span');
  reaction.className = 'emotion-reaction';
  reaction.setAttribute('role', 'img');
  reaction.setAttribute('aria-label', `${messageText}. A gentle tone-based check-in that may not fit.`);
  reaction.title = `${messageText} · a gentle tone-based check-in`;
  reaction.textContent = emoji;
  message.append(reaction);
}

function renderStarters() {
  const grid = document.querySelector('#starterGrid');
  starters.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'starter-chip';
    button.innerHTML = `<span aria-hidden="true" style="color:#8ba184;margin-right:5px">${item.icon}</span>${item.label}`;
    button.addEventListener('click', () => {
      document.querySelectorAll('.starter-chip').forEach((chip) => chip.classList.remove('selected'));
      button.classList.add('selected'); dilemmaInput.value = item.text; updateCharCount(); autoExpand(dilemmaInput); dilemmaInput.focus();
    });
    grid.append(button);
  });
}
function readSavedConversations() {
  try {
    const stored = JSON.parse(localStorage.getItem(conversationStorageKey) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (_) { return []; }
}
function writeSavedConversations(conversations) {
  try { localStorage.setItem(conversationStorageKey, JSON.stringify(conversations)); return true; }
  catch (_) { return false; }
}
function renderSavedDecisions() {
  const section = document.querySelector('#savedDecisions');
  const list = document.querySelector('#savedDecisionList');
  const records = readSavedConversations().sort((a, b) => b.savedAt - a.savedAt);
  list.replaceChildren();
  section.classList.toggle('hidden', records.length === 0);
  const groups = new Map();
  for (const record of records) {
    const key = record.groupId || record.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const versions of groups.values()) {
    const group = document.createElement('article'); group.className = 'saved-decision-card';
    const title = document.createElement('strong'); title.className = 'saved-decision-title'; title.textContent = versions[0].dilemma;
    group.append(title);
    for (const record of versions) {
      const version = document.createElement('div'); version.className = 'saved-decision-version';
      const info = document.createElement('div'); info.className = 'saved-decision-info';
      const date = document.createElement('span'); date.textContent = `${new Date(record.savedAt).toLocaleDateString()} · ${record.parentId ? 'Revisited decision' : 'Original conversation'}`;
      const styleName = record.category ? ` · Style: ${record.category[0].toUpperCase()}${record.category.slice(1)}` : '';
      const decision = document.createElement('p'); decision.textContent = `Decision: ${record.decision || 'Not recorded'}${styleName}`;
      info.append(date, decision);
      const actions = document.createElement('div'); actions.className = 'saved-decision-actions';
      const view = document.createElement('button'); view.type = 'button'; view.className = 'secondary-button'; view.textContent = 'View saved conversation';
      view.addEventListener('click', () => viewSavedConversation(record.id));
      const revisit = document.createElement('button'); revisit.type = 'button'; revisit.className = 'secondary-button'; revisit.textContent = 'Revisit and decide again';
      revisit.addEventListener('click', () => beginSession(record.dilemma, record));
      actions.append(view, revisit); version.append(info, actions); group.append(version);
    }
    list.append(group);
  }
}
function updateCharCount() { document.querySelector('#charCount').textContent = dilemmaInput.value.length; }
function autoExpand(textarea) {
  textarea.style.height = 'auto';
  const maxHeight = 240;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
function addMessage(role, text, note = '') {
  const article = document.createElement('article'); article.className = `message ${role}-message${note ? ' message-with-note' : ''}`;
  const meta = document.createElement('div'); meta.className = 'message-meta'; meta.textContent = role === 'assistant' ? 'DECISIONMATE' : 'YOU';
  const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = text;
  article.append(meta, bubble);
  if (note) { const aside = document.createElement('span'); aside.className = 'message-note'; aside.textContent = note; article.append(aside); }
  chatMessages.append(article); article.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return article;
}
function phaseFor(stage) { return stage === 'think' ? 'THINKING IT THROUGH' : stage === 'decide' ? 'YOUR DECISION' : 'LOOKING BACK'; }
function firstThinkQuestion(dilemma) {
  if (/internship|stipend|experience|job|work/i.test(dilemma)) return 'For this internship, what matters most to you: learning, earning money, or something else?';
  if (/family|parent|expectation/i.test(dilemma)) return 'What do you want, and what does your family want?';
  if (/friend|relationship/i.test(dilemma)) return 'What would you like to change about this situation?';
  return 'What matters most to you here? Why is it important right now?';
}
function nextThinkQuestion(latest) {
  const text = latest.toLowerCase();
  const previous = state.answers.slice(0, -1).join(' ').toLowerCase();
  const hasPrevious = pattern => pattern.test(previous);
  const saidUncertain = /\b(not sure|unsure|uncertain|confused|don't know|do not know|hard to tell|no idea)\b/.test(text);
  const compares = /\b(but|however|versus|vs\.?|although|on the other hand|trade.?off|while)\b/.test(text) || /\bmore than\b/.test(text);
  const mentionsPressure = /\b(pressure|worried|worry|anxious|afraid|scared|nervous|stress|overwhelmed|expectation|disappoint)\b/.test(text);
  const mentionsOthers = /\b(parent|family|friend|teacher|partner|team|people|others|someone|they want|they think)\b/.test(text);
  const mentionsConstraint = /\b(money|stipend|salary|income|cost|afford|time|schedule|distance|travel|health|deadline|responsibilit|commitment)\b/.test(text);
  const mentionsEvidence = /\b(know|learned|found out|told me|experience|fact|information|evidence|tried|research)\b/.test(text);
  const hasOptions = /\b(option|choice|either|both|one is|other is|between|could|alternative)\b/.test(text);
  const short = tokenize(latest).length < 9;

  // Pick the most useful unresolved thread from what the student actually said.
  if (saidUncertain && !hasPrevious(/\b(not sure|unsure|uncertain|confused|don't know|do not know|no idea)\b/)) {
    return 'You’re not sure yet. What is the main thing you need to find out to make this choice?';
  }
  if (compares && !hasPrevious(/\b(but|however|versus|vs\.?|although|trade.?off|while)\b/)) {
    const focus = mentionsConstraint ? 'what you need day to day and what you could learn' : 'the two things you’re choosing between';
    return `You’re choosing between ${focus}. What would make either choice feel right for you?`;
  }
  if (mentionsPressure && !hasPrevious(/\b(pressure|worried|worry|anxious|afraid|scared|nervous|stress|overwhelmed)\b/)) {
    return 'You mentioned a concern about this. What worries you most? Is there anything you can change?';
  }
  if (mentionsOthers && !hasPrevious(/\b(parent|family|friend|teacher|partner|team|people|others|someone|they want|they think)\b/)) {
    return 'Other people seem to be part of this too. What do you want, apart from what they want you to do?';
  }
  if (mentionsConstraint && !hasPrevious(/\b(money|stipend|salary|income|cost|afford|time|schedule|distance|travel|health|deadline|responsibilit|commitment)\b/)) {
    return 'You mentioned something practical that could make this harder. Can you change it, or could someone help?';
  }
  if (!mentionsEvidence && hasPrevious(/\b(know|learned|found out|told me|experience|fact|information|evidence|tried|research)\b/)) {
    return 'You already know a few things. What do you still need to find out, if anything, before you choose?';
  }
  if (hasOptions && !hasPrevious(/\b(option|choice|either|both|between|could|alternative)\b/)) {
    return 'You’ve named a few choices. What matters most as you compare them? Which one fits that best so far?';
  }
  if (short) return 'Could you tell me a little more? What makes that important to you?';
  if (!/consequence|if you choose|next step/.test(previous)) {
    return 'If you chose the option you’re leaning toward, what might happen over the next few weeks? How does that feel?';
  }
  return 'Of everything you’ve shared, what matters most as you make this choice?';
}
function tokenize(text) { return text.toLowerCase().match(/[a-z0-9']+/g) || []; }
function updateSessionChrome() {
  const answered = state.answers.length;
  const step = state.stage === 'think' ? answered + 1 : state.stage === 'decide' ? answered + 1 : answered + 2;
  document.querySelector('#phaseEyebrow').textContent = phaseFor(state.stage);
  document.querySelector('#stepNumber').textContent = String(Math.min(step, 8)).padStart(2, '0');
  document.querySelector('#stepTotal').textContent = '08';
  document.querySelector('#progressFill').style.width = `${Math.min(94, 12 + step * 11)}%`;
  document.querySelector('#sessionTitle').textContent = state.stage === 'think' ? 'Let’s get a clearer picture.' : state.stage === 'decide' ? 'The choice is yours.' : 'Take a moment to look back.';
  updateAgencyMeter();
  const items = document.querySelectorAll('.thought-item');
  const active = state.stage === 'think' ? (state.thinkIndex < 2 ? 0 : 1) : state.stage === 'decide' ? 2 : 2;
  items.forEach((item, i) => { item.classList.toggle('active', i === active); item.classList.toggle('done', i < active); });
}
function updateAgencyMeter() {
  const answers = state.userMessages.slice(1);
  const latest = (answers[answers.length - 1] || state.dilemma).toLowerCase();
  const fullText = answers.join(' ').toLowerCase();
  const assistantMessages = [...chatMessages.querySelectorAll('.assistant-message:not(.typing-message) .message-bubble')]
    .map(bubble => bubble.textContent.toLowerCase());
  const latestWords = new Set(tokenize(latest).filter(word => word.length > 3));
  const repeatedAssistantWording = assistantMessages.some(message => {
    const assistantWords = tokenize(message).filter(word => word.length > 3);
    if (assistantWords.length < 5 || latestWords.size < 5) return false;
    const overlap = assistantWords.filter(word => latestWords.has(word)).length;
    return overlap / Math.min(assistantWords.length, latestWords.size) >= .62;
  });
  const decisionContext = `${state.dilemma} ${fullText}`;
  const comparesOptions = /\b(choosing between|deciding between|torn between|can't choose|cannot choose|not sure which|unsure which|which one should i)\b/.test(decisionContext);
  const asksOthersToChoose = /\b(what should i do|what should i choose|what should i decide|choose for me|decide for me|tell me what to do|make this decision for me|how should i decide)\b/.test(decisionContext);
  const clearChoice = /\b(i have decided|i've decided|i decide to|i chose|i choose|i will|i'll|i am going to|i'm going to|my decision is|i plan to|i prefer|i'm taking|i am taking|i accept|i'm leaving|i am leaving)\b/.test(latest);
  const usedAdviceInReplies = /\b(advice|suggest|recommend|my parents|my family|my friend|my teacher|my mentor|they think|they want|someone said|talked with|discussed)\b/.test(fullText);
  const asksForAdvice = /\b(advice|suggest|recommend|my parents|my family|my friend|my teacher|my mentor|they think|they want|someone said|help me decide|what do you think|how should i decide|what should i choose|what should i do)\b/.test(decisionContext);
  const addsOwnView = /\b(i think|i feel|i want|i need|for me|my priority|what matters to me|because|i would rather|i prefer)\b/.test(fullText);
  let stage = 'outsourced';
  if (clearChoice && !comparesOptions && !repeatedAssistantWording) {
    stage = usedAdviceInReplies && addsOwnView ? 'consultative' : 'empowered';
  } else if (addsOwnView && (asksForAdvice || repeatedAssistantWording || comparesOptions)) {
    stage = 'consultative';
  } else if (!asksOthersToChoose && asksForAdvice && addsOwnView) {
    stage = 'consultative';
  }
  const meter = document.querySelector('#agencyMeter');
  meter.dataset.stage = stage;
  meter.setAttribute('aria-label', `Decision ownership: ${stage[0].toUpperCase()}${stage.slice(1)}`);
  const current = document.querySelector('#agencyMeterCurrent');
  current.textContent = `Current approach: ${stage[0].toUpperCase()}${stage.slice(1)}`;
}
async function beginSession(dilemma, previousSession = null) {
  state.abortController?.abort();
  state.requestId += 1;
  state.dilemma = dilemma.trim(); state.answers = []; state.stage = 'think'; state.thinkIndex = 0; state.decision = ''; state.reflection = ''; state.outcome = ''; state.userMessages = [state.dilemma]; state.sessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; state.groupId = previousSession?.groupId || state.sessionId; state.parentId = previousSession?.id || null; state.previousContext = previousSession ? [
    `Earlier situation: ${previousSession.dilemma}`,
    `Earlier decision: ${previousSession.decision}`,
    `Earlier reflection: ${previousSession.reflection}`,
    `Earlier thinking: ${(previousSession.answers || []).slice(-2).join(' ')}`
  ].join('\n').slice(0, 2000) : ''; state.viewingSaved = false; state.pending = false;
  homeView.classList.add('hidden'); resultView.classList.add('hidden'); sessionView.classList.remove('hidden');
  chatMessages.innerHTML = ''; answerInput.value = ''; autoExpand(answerInput); answerInput.disabled = false; document.querySelector('#answerForm .send-button').disabled = false; answerInput.placeholder = 'Take your time…'; composerWrap.classList.remove('hidden');
  const openingMessage = addMessage('user', state.dilemma);
  updateSessionChrome(); updateTone(); showEmotionReaction(openingMessage, updateTone([state.dilemma], false)); window.scrollTo({ top: 0, behavior: 'smooth' });
  const fallback = previousSession
    ? 'It sounds like this choice still has a few sides to it. What has changed since you last thought it through, or what would you like to look at differently this time?'
    : 'Thanks for sharing. I won’t choose for you. We can think about what matters to you and what choices you have.\n\n' + firstThinkQuestion(state.dilemma);
  await requestAssistantTurn(fallback);
}
async function askForDecision() {
  state.stage = 'decide';
  updateSessionChrome(); answerInput.placeholder = 'I decide to…';
  await requestAssistantTurn('You’ve thought about what matters and the choices you have.\n\nSo, what do you decide?');
}
async function askForSatisfaction() {
  state.stage = 'reflect';
  updateSessionChrome(); answerInput.placeholder = 'Yes or no…';
  await requestAssistantTurn('Are you satisfied with your current decision?', { note: 'Please answer yes or no.' });
}
async function requestAssistantTurn(fallback, { note = '' } = {}) {
  if (state.pending) return;
  state.pending = true;
  const requestId = ++state.requestId;
  const controller = new AbortController(); state.abortController = controller;
  const timeout = window.setTimeout(() => controller.abort(), 18000);
  const submit = document.querySelector('#answerForm .send-button');
  const typing = addMessage('assistant', 'Thinking…'); typing.classList.add('typing-message');
  if (submit) submit.disabled = true;
  answerInput.disabled = true;
  document.querySelector('#modelNotice').classList.add('hidden');
  const fullTranscript = [...chatMessages.querySelectorAll('.message:not(.typing-message)')].map(message => ({
    role: message.classList.contains('assistant-message') ? 'assistant' : 'user',
    content: message.querySelector('.message-bubble')?.textContent || ''
  }));
  // Preserve every student message across the full session. Keep only the latest
  // four assistant turns so earlier answers are not silently dropped as chat grows.
  const recentAssistantIndexes = fullTranscript
    .map((message, index) => message.role === 'assistant' ? index : -1)
    .filter(index => index >= 0)
    .slice(-4);
  const retainedAssistantIndexes = new Set(recentAssistantIndexes);
  const transcript = fullTranscript.filter((message, index) => message.role === 'user' || retainedAssistantIndexes.has(index));
  let reply = null;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: state.stage, think_count: state.thinkIndex, messages: transcript, prior_context: state.previousContext }),
      signal: controller.signal
    });
    if (response.ok) {
      const result = await response.json();
      if (typeof result.reply === 'string' && result.reply.trim() && result.reply.length <= 700) reply = result.reply.trim();
    }
  } catch (_) { /* Local guided prompts remain available when the model endpoint is not deployed. */ }
  window.clearTimeout(timeout);
  if (requestId !== state.requestId) return;
  state.abortController = null;
  typing.remove();
  if (reply) {
    addMessage('assistant', reply, note);
  } else {
    addMessage('assistant', fallback, note);
    document.querySelector('#modelNotice').classList.remove('hidden');
  }
  state.pending = false;
  if (submit) submit.disabled = false;
  answerInput.disabled = false;
  updateSessionChrome();
  answerInput.focus();
}
function goBackOneStep() {
  reset();
}
function returnToConversation() {
  resultView.classList.add('hidden'); sessionView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function onAnswer(value) {
  const answer = value.trim(); if (!answer || state.pending) return;
  const userMessage = addMessage('user', answer); answerInput.value = ''; autoExpand(answerInput); state.userMessages.push(answer); updateTone(); updateAgencyMeter();
  showEmotionReaction(userMessage, state.stage === 'decide' ? 'decided' : updateTone(state.userMessages.slice(-2), false));
  if (state.stage === 'think') {
    state.answers.push(answer); state.thinkIndex += 1;
    if (state.thinkIndex < maxThinkQuestions) {
      await requestAssistantTurn(nextThinkQuestion(answer));
    } else {
      await askForDecision();
    }
  } else if (state.stage === 'decide') { state.decision = answer; await askForSatisfaction(); }
  else {
    state.reflection = answer;
    if (/^\s*y(?:es)?\b/i.test(answer) || /^\s*n(?:o)?\b/i.test(answer)) {
      answerInput.disabled = true; document.querySelector('#answerForm .send-button').disabled = true;
    }
    if (/^\s*y(?:es)?\b/i.test(answer)) {
      state.outcome = 'satisfied';
    addMessage('assistant', '“A thoughtful decision does not need perfect certainty. You can take your next step with care and adjust as you learn.”');
      await new Promise(resolve => window.setTimeout(resolve, 1400));
      finishSession();
    } else if (/^\s*n(?:o)?\b/i.test(answer)) {
      state.outcome = 'not-satisfied';
      addMessage('assistant', 'Thank you for sharing this with me. It was nice talking with you. Have a great conversation next time.');
      saveConversationRecord(getDecisionStyle().label.toLowerCase());
      composerWrap.classList.add('hidden'); answerInput.disabled = true; document.querySelector('#answerForm .send-button').disabled = true;
      await new Promise(resolve => window.setTimeout(resolve, 2200));
      reset();
    } else {
      await requestAssistantTurn('Please answer yes or no: are you satisfied with your current decision?');
    }
  }
  updateSessionChrome();
}
const decisionStyles = {
  undecided: { emoji: '🤔', label: 'Undecided', description: 'You may still be working out which choice feels right.' },
  consultative: { emoji: '🤝', label: 'Consultative', description: 'You are using other people’s input alongside your own thinking.' },
  empowered: { emoji: '💪', label: 'Empowered', description: 'You are taking ownership of the choice yourself.' }
};
function getDecisionStyle(decision = state.decision, answers = state.answers) {
  const decisionText = decision.toLowerCase();
  const all = [...answers, decision].join(' ').toLowerCase();
  const ownsChoice = /\b(i decide|i have decided|i've decided|i chose|i choose|i will|i'll|i'm going to|i am going to|i'm choosing|i am choosing|my choice|my decision|i prefer|i think|i plan to|i want to|i am taking|i'm taking|i am leaving|i'm leaving|i accept)\b/.test(decisionText);
  const uncertain = /\b(not sure|unsure|undecided|can't decide|cannot decide|still deciding|maybe|i don't know)\b/.test(decisionText);
  const consultative = /\b(advice|suggest|recommend|my parents|my family|my friend|my teacher|my mentor|they think|they want|talked with|discussed)\b/.test(all);
  if (uncertain && !ownsChoice) return decisionStyles.undecided;
  if (ownsChoice && consultative) return decisionStyles.consultative;
  if (ownsChoice) return decisionStyles.empowered;
  if (consultative) return decisionStyles.consultative;
  return decisionStyles.undecided;
}
function renderDecisionStyles(activeStyle) {
  const list = document.querySelector('#decisionEmojiList'); list.replaceChildren();
  for (const [id, style] of Object.entries(decisionStyles)) {
    const item = document.createElement('div'); item.className = `decision-emoji-item${style.label === activeStyle?.label ? ' active' : ''}`;
    item.setAttribute('role', 'listitem'); item.title = `${style.label}: ${style.description}`;
    const emoji = document.createElement('span'); emoji.className = 'decision-emoji'; emoji.textContent = style.emoji;
    const label = document.createElement('span'); label.className = 'decision-emoji-label'; label.textContent = style.label;
    item.append(emoji, label); list.append(item);
  }
  document.querySelector('#decisionStyleSummary').textContent = `Your conversation most suggests ${activeStyle.label}: ${activeStyle.description}`;
}
function saveConversationRecord(styleId) {
  const record = {
    id: state.sessionId, groupId: state.groupId, parentId: state.parentId,
    savedAt: Date.now(), dilemma: state.dilemma, answers: [...state.answers],
    decision: state.decision, reflection: state.reflection, category: styleId, outcome: state.outcome || 'satisfied',
    transcript: [...chatMessages.querySelectorAll('.message:not(.typing-message)')].map(message => ({
      role: message.classList.contains('assistant-message') ? 'assistant' : 'user',
      content: message.querySelector('.message-bubble')?.textContent || ''
    }))
  };
  const saved = readSavedConversations();
  const existingIndex = saved.findIndex(item => item.id === record.id);
  if (existingIndex >= 0) saved[existingIndex] = record; else saved.push(record);
  writeSavedConversations(saved); renderSavedDecisions();
  return record;
}
function finishSession() {
  const style = getDecisionStyle();
  const record = saveConversationRecord(style.label.toLowerCase());
  renderSavedSnapshot(record);
  state.viewingSaved = false;
  sessionView.classList.add('hidden'); resultView.classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'});
}
function renderSavedSnapshot(record) {
  renderDecisionStyles(decisionStyles[record.category] || getDecisionStyle(record.decision || '', record.answers || []));
  document.querySelector('#affirmationText').textContent = 'A thoughtful decision does not need perfect certainty. You can take your next step with care and adjust as you learn.';
  document.querySelector('#reflectionText').textContent = record.reflection;
  document.querySelector('#decisionText').textContent = record.decision;
  const transcriptForPrint = document.querySelector('#printTranscript'); transcriptForPrint.innerHTML = '';
  for (const message of record.transcript || []) {
    const entry = document.createElement('p');
    const speaker = document.createElement('strong'); speaker.textContent = message.role === 'assistant' ? 'DecisionMate: ' : 'You: ';
    entry.append(speaker, document.createTextNode(message.content));
    transcriptForPrint.append(entry);
  }
}
function viewSavedConversation(id) {
  const record = readSavedConversations().find(item => item.id === id);
  if (!record) return;
  state.dilemma = record.dilemma; state.answers = [...(record.answers || [])]; state.stage = 'reflect';
  state.thinkIndex = state.answers.length; state.decision = record.decision; state.reflection = record.reflection;
  state.userMessages = (record.transcript || []).filter(item => item.role === 'user').map(item => item.content);
  state.sessionId = record.id; state.groupId = record.groupId; state.parentId = record.parentId; state.viewingSaved = true;
  chatMessages.replaceChildren();
  for (const message of record.transcript || []) addMessage(message.role, message.content);
  answerInput.value = ''; answerInput.disabled = true; document.querySelector('#answerForm .send-button').disabled = true;
  composerWrap.classList.add('hidden'); updateTone(); updateSessionChrome();
  document.querySelector('#sessionTitle').textContent = 'Saved conversation';
  renderSavedSnapshot(record);
  homeView.classList.add('hidden'); resultView.classList.add('hidden'); sessionView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function downloadSessionText() {
  const transcript = [...chatMessages.querySelectorAll('.message:not(.typing-message)')].map(message => {
    const role = message.classList.contains('assistant-message') ? 'DecisionMate' : 'You';
    return `${role}: ${message.querySelector('.message-bubble')?.textContent || ''}`;
  }).join('\n\n');
  const content = [
    'DecisionMate — Your Decision Style',
    `Saved on: ${new Date().toLocaleDateString()}`,
    '', 'YOUR DECISION', state.decision,
    '', 'YOUR REFLECTION', state.reflection,
    '', 'DECISION STYLE', `${getDecisionStyle().emoji} ${getDecisionStyle().label} — ${getDecisionStyle().description}`,
    '', 'A THOUGHT TO CARRY WITH YOU', 'A thoughtful decision does not need perfect certainty. You can take your next step with care and adjust as you learn.',
    '', 'CONVERSATION', transcript,
    '', 'A rough reflection of your conversation, not a grade or a prediction.'
  ].join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'decisionmate-snapshot.txt'; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function reset() {
  state.abortController?.abort(); state.abortController = null; state.requestId += 1; state.pending = false; answerInput.disabled = false; document.querySelector('#answerForm .send-button').disabled = false;
  state.viewingSaved = false; state.previousContext = ''; composerWrap.classList.remove('hidden'); renderSavedDecisions();
  sessionView.classList.add('hidden'); resultView.classList.add('hidden'); homeView.classList.remove('hidden');
  dilemmaInput.value = ''; autoExpand(dilemmaInput); updateCharCount(); document.querySelectorAll('.starter-chip').forEach(c=>c.classList.remove('selected')); window.scrollTo({top:0,behavior:'smooth'}); dilemmaInput.focus();
}
document.querySelector('#dilemmaForm').addEventListener('submit', e => { e.preventDefault(); if (dilemmaInput.value.trim()) beginSession(dilemmaInput.value); });
document.querySelector('#answerForm').addEventListener('submit', e => { e.preventDefault(); onAnswer(answerInput.value); });
document.querySelector('#backStep').addEventListener('click', goBackOneStep);
document.querySelector('#backFromResult').addEventListener('click', returnToConversation);
document.querySelector('#clearMemory').addEventListener('click', () => {
  if (!window.confirm('Clear all saved decisions from this browser? This cannot be undone.')) return;
  try { localStorage.removeItem(conversationStorageKey); } catch (_) { /* Storage may be unavailable in this browser. */ }
  renderSavedDecisions();
});
dilemmaInput.addEventListener('input', () => { updateCharCount(); autoExpand(dilemmaInput); });
answerInput.addEventListener('input', () => autoExpand(answerInput));
for (const id of ['restartTop','restartAside','homeLink','newSession']) document.querySelector(`#${id}`).addEventListener('click', e => { e.preventDefault(); reset(); });
document.querySelector('#downloadPdf').addEventListener('click', () => window.print());
document.querySelector('#downloadText').addEventListener('click', downloadSessionText);
answerInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.querySelector('#answerForm').requestSubmit(); } });
dilemmaInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.querySelector('#dilemmaForm').requestSubmit(); } });
renderStarters();
renderSavedDecisions();
