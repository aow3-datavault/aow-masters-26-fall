const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const shared = document.documentElement.dataset.mode === 'pages';
const screens = ['bracket', 'overlay', 'versus', 'result', 'victory', 'podium'];
const view = shared ? (screens.includes(params.get('view')) ? params.get('view') : 'bracket') : params.get('view') || 'operator';
const lang = params.get('lang') === 'ru' ? 'ru' : 'en';
document.documentElement.lang = lang;
const words = {
  en: { title: 'AOW MASTERS', lab: 'TOURNAMENT CONTROL', live: 'LIVE', offline: 'WAITING FOR SERVER', rounds: 'TOURNAMENT ROUNDS', preview: 'MATCH PREVIEW', publish: 'PUBLISH TO LIVE', select: 'Select a match', result: 'ENTER RESULT', submit: 'SAVE RESULT', score: 'Score', game: 'GAME', final: 'FINAL', bracket: 'CHAMPIONSHIP BRACKET', empty: 'No tournament data yet', round: 'ROUND', player: 'PLAYER', clan: 'CLAN', faction: 'FACTION', language: 'LANGUAGE', choose: 'Choose a match to preview', confirm: 'Save this result to the local tournament state?', updated: 'Live match published', saved: 'Result saved', failed: 'Action failed', waiting: 'WAITING FOR PAIRING' },
  ru: { title: 'AOW MASTERS', lab: 'УПРАВЛЕНИЕ ТУРНИРОМ', live: 'ЭФИР', offline: 'ОЖИДАНИЕ СЕРВЕРА', rounds: 'ТУРЫ ТУРНИРА', preview: 'ПРЕДПРОСМОТР МАТЧА', publish: 'ВЫВЕСТИ В ЭФИР', select: 'Выберите матч', result: 'ВВОД РЕЗУЛЬТАТА', submit: 'СОХРАНИТЬ РЕЗУЛЬТАТ', score: 'Счёт', game: 'ИГРА', final: 'ИТОГ', bracket: 'СЕТКА ЧЕМПИОНАТА', empty: 'Данные турнира пока отсутствуют', round: 'ТУР', player: 'ИГРОК', clan: 'КЛАН', faction: 'ФРАКЦИЯ', language: 'ЯЗЫК', choose: 'Выберите матч для предпросмотра', confirm: 'Сохранить результат в локальном состоянии турнира?', updated: 'Матч выведен в эфир', saved: 'Результат сохранён', failed: 'Не удалось выполнить действие', waiting: 'ОЖИДАНИЕ ПАРЫ' }
};
const t = words[lang];
const broadcastWords = lang === 'ru' ? {
  result: 'РЕЗУЛЬТАТ МАТЧА', victory: 'ПОБЕДИТЕЛЬ МАТЧА', podium: 'ИТОГИ ТУРНИРА',
  waitingResult: 'ОЖИДАНИЕ РЕЗУЛЬТАТА', waitingPodium: 'ОЖИДАНИЕ ИТОГОВ ТУРНИРА',
  places: ['ЧЕМПИОН', '2-Е МЕСТО', '3-Е МЕСТО']
} : {
  result: 'MATCH RESULT', victory: 'MATCH WINNER', podium: 'TOURNAMENT RESULTS',
  waitingResult: 'AWAITING MATCH RESULT', waitingPodium: 'AWAITING TOURNAMENT RESULTS',
  places: ['CHAMPION', 'SECOND PLACE', 'THIRD PLACE']
};
const soundOn = !['0', 'off'].includes(params.get('sound'));
const cuesByView = {
  versus: [['whoosh', 0, .55], ['vs-slam', 1200, .8]],
  result: [['step', 560, .55]],
  victory: [['victory', 410, .72]],
  podium: [['step', 400, .48], ['step', 760, .52], ['victory', 1010, .72]]
};
const audio = new Map();
const cueTimers = new Set();
let broadcastKey;
let state = null;
let selectedId = '';
let statusMessage = '';
let gameStatus = null;

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function getMatch(id) {
  for (const round of state?.rounds || []) for (const match of round.matches || []) if (match.id === id) return { match, round };
  return null;
}

function playerName(player) { return player?.name || '—'; }
function scoreText(match, i) { return Number(match.scores?.[i] || 0); }
function isComplete(match) { return match.winner === 0 || match.winner === 1; }
function roundTitle(round) {
  if (lang === 'ru') return round.title;
  return ({ '1/4 финала': 'Quarterfinal', 'Полуфинал': 'Semifinal', 'Финал': 'Final',
    'Матч за 3-е место': 'Third-place match' })[round.title] || round.title;
}
function factionName(player) {
  if (!player?.faction) return '';
  const names = lang === 'ru' ? { resistance: 'Сопротивление', confederation: 'Конфедерация' } :
    { resistance: 'Resistance', confederation: 'Confederation' };
  return names[player.faction] || player.faction;
}

function currentGame(match) { return Math.min((match.scores?.[0] || 0) + (match.scores?.[1] || 0) + 1, match.bestOf || 1); }

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t.failed);
  return data;
}

function render() {
  if (view === 'versus') {
    renderVersus();
    return;
  }
  if (view === 'result' || view === 'victory') {
    renderMatchResult();
    return;
  }
  if (view === 'podium') {
    renderPodium();
    return;
  }
  app.replaceChildren();
  if (view === 'overlay') renderOverlay();
  else if (view === 'bracket') renderBracket();
  else renderOperator();
}

function prepareCues() {
  if (!soundOn) return;
  for (const [name] of cuesByView[view] || []) {
    if (audio.has(name)) continue;
    const track = new Audio(`sfx/${name}.ogg`);
    track.preload = 'auto';
    audio.set(name, track);
  }
}

function replaceBroadcast(key, stage, animate) {
  broadcastKey = key;
  for (const timer of cueTimers) window.clearTimeout(timer);
  cueTimers.clear();
  for (const track of audio.values()) track.pause();
  app.replaceChildren(stage);
  if (!soundOn || !animate) return;

  console.debug('Masters Lab broadcast', view, key);
  for (const [name, delay, volume] of cuesByView[view]) {
    const timer = window.setTimeout(() => {
      cueTimers.delete(timer);
      const track = audio.get(name);
      track.currentTime = 0;
      track.volume = volume;
      track.play().catch(error => {
        if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
          console.debug('Masters Lab sound', name, error.name);
        }
      });
    }, delay);
    cueTimers.add(timer);
  }
}

function broadcastStage(label, meta = '', waiting = false) {
  document.body.className = 'broadcast-body';
  const stage = el('section', `broadcast-stage broadcast-${view}${waiting ? ' broadcast-waiting' : ''}`);
  const header = el('header', 'broadcast-header');
  header.append(el('span', 'broadcast-brand', t.title));
  if (label) header.append(el('h1', 'broadcast-heading', label));
  if (meta) header.append(el('p', 'broadcast-meta', meta));
  stage.append(header);
  return stage;
}

function playerAvatar(player) {
  const avatar = el('div', 'broadcast-avatar', player.name[0]);
  if (player.faction === 'confederation' || player.faction === 'resistance') {
    avatar.dataset.faction = player.faction;
  }
  avatar.setAttribute('aria-hidden', 'true');
  const image = el('img', 'broadcast-avatar-image');
  image.alt = '';
  image.addEventListener('error', () => image.remove(), { once: true });
  image.src = player.portrait?.replace(/^\//, '') || `summer/icons/${encodeURIComponent(player.name)}.png`;
  avatar.append(image);
  return avatar;
}

function broadcastPlayer(player, index, winner) {
  const card = el('article', `broadcast-player broadcast-side-${index} broadcast-${player.faction || 'neutral'}${winner ? ' broadcast-winner' : ''}`);
  const identity = el('div', 'broadcast-identity');
  identity.append(el('p', 'broadcast-faction', factionName(player)));
  identity.append(el('h2', 'broadcast-name', playerName(player)));
  if (player.clan) identity.append(el('p', 'broadcast-clan', player.clan));
  card.append(playerAvatar(player), identity);
  return card;
}

function renderVersus() {
  const live = getMatch(state?.publishedId);
  const ready = live?.match.players.every(Boolean);
  const key = ready ? JSON.stringify([state.broadcastRevision, live.match.id, live.match.players]) : '';
  if (broadcastKey === key) return;
  if (!ready) {
    replaceBroadcast(key, broadcastStage(t.waiting, '', true), false);
    return;
  }
  const { match, round } = live;
  const stage = broadcastStage('', `${roundTitle(round)} · BO${match.bestOf}`);
  const lineup = el('div', 'versus-lineup');
  const impact = el('div', 'versus-impact');
  impact.append(el('span', 'versus-ring'), el('span', 'versus-mark', 'VS'));
  const flash = el('div', 'versus-flash');
  flash.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 16; index++) {
    const spark = el('i', 'versus-spark');
    spark.style.setProperty('--angle', `${index * 22.5}deg`);
    spark.style.setProperty('--distance', `${14 + (index % 4) * 4}vw`);
    flash.append(spark);
  }
  lineup.append(broadcastPlayer(match.players[0], 0), impact, broadcastPlayer(match.players[1], 1));
  stage.append(lineup, flash);
  replaceBroadcast(key, stage, true);
}

function renderMatchResult() {
  const live = getMatch(state?.publishedId);
  const ready = live && isComplete(live.match) && live.match.players.every(Boolean);
  const key = ready ? JSON.stringify([state.broadcastRevision, live.match.id, live.match.players, live.match.scores, live.match.winner]) : '';
  const score = ready ? `${scoreText(live.match, 0)} : ${scoreText(live.match, 1)}` : '';
  if (broadcastKey === key) {
    const scoreNode = app.querySelector('.result-score');
    if (scoreNode && scoreNode.textContent !== score) scoreNode.textContent = score;
    return;
  }
  if (!ready) {
    replaceBroadcast(key, broadcastStage(broadcastWords.waitingResult, '', true), false);
    return;
  }

  const { match, round } = live;
  const stage = broadcastStage(broadcastWords[view], `${roundTitle(round)} · BO${match.bestOf}`);
  if (view === 'victory') {
    const winner = match.players[match.winner];
    const banner = el('div', 'victory-banner');
    banner.append(playerAvatar(winner), el('h2', 'victory-name', winner.name));
    if (winner.clan) banner.append(el('p', 'victory-clan', winner.clan));
    stage.append(banner);
  } else {
    const lineup = el('div', 'result-lineup');
    lineup.append(broadcastPlayer(match.players[0], 0, match.winner === 0),
      el('strong', 'result-score', score), broadcastPlayer(match.players[1], 1, match.winner === 1));
    stage.append(lineup);
  }
  replaceBroadcast(key, stage, true);
}

function renderPodium() {
  const final = getMatch('r3-1')?.match;
  const bronze = getMatch('third')?.match;
  const ready = [final, bronze].every(match => match && isComplete(match) && match.players.every(Boolean));
  const players = ready ? [final.players[final.winner], final.players[1 - final.winner], bronze.players[bronze.winner]] : [];
  const key = ready ? JSON.stringify(players) : '';
  if (broadcastKey === key) return;
  if (!ready) {
    replaceBroadcast(key, broadcastStage(broadcastWords.waitingPodium, '', true), false);
    return;
  }

  const stage = broadcastStage(broadcastWords.podium);
  const lineup = el('div', 'podium-lineup');
  players.forEach((player, index) => {
    const stand = el('article', `podium-place podium-place-${index + 1}`);
    stand.append(el('span', 'podium-label', broadcastWords.places[index]), playerAvatar(player),
      el('h2', 'podium-name', player.name));
    if (player.clan) stand.append(el('p', 'podium-clan', player.clan));
    stand.append(el('div', 'podium-plinth', String(index + 1)));
    lineup.append(stand);
  });
  stage.append(lineup);
  replaceBroadcast(key, stage, true);
}

function renderOverlay() {
  document.body.className = 'overlay-body';
  const live = getMatch(state?.publishedId);
  if (!live) return;
  const { match, round } = live;
  const root = el('section', 'overlay-stage');
  const board = el('div', 'masters-scoreboard');
  const header = el('header', 'masters-scoreboard-header');
  const series = isComplete(match) ? (lang === 'ru' ? 'Итог' : 'Result') : `${t.game} ${currentGame(match)}`;
  header.append(el('span', '', roundTitle(round) || t.round), el('span', '', `BO${match.bestOf} · ${series}`));
  board.append(header);
  match.players.forEach((player, side) => {
    const faction = ['confederation', 'resistance'].includes(player?.faction) ? player.faction : 'neutral';
    const winner = match.winner === side;
    const row = el('div', `masters-bracket-card masters-scoreboard-row masters-bracket-${faction}${winner ? ' is-winner' : isComplete(match) ? ' is-eliminated' : ''}`);
    row.append(player ? playerAvatar(player) : el('span', 'masters-bracket-placeholder'),
      el('span', 'masters-scoreboard-name', playerName(player)),
      el('strong', 'masters-scoreboard-value', String(scoreText(match, side))));
    board.append(row);
  });
  root.append(board);
  app.append(root);
}

function renderBracket() {
  document.body.className = 'masters-bracket-body';
  document.documentElement.lang = lang;
  const root = el('section', 'masters-bracket');
  root.setAttribute('aria-label', t.bracket);
  root.append(el('h1', 'masters-bracket-title', "Art of War Masters ’26 / Fall"));

  const positions = [
    { x: 130, ys: [295, 500, 705, 910], ids: ['r1-1', 'r1-2', 'r1-3', 'r1-4'], labels: [1, 2, 3, 4], bestOf: 1 },
    { x: 720, ys: [398, 808], ids: ['r2-1', 'r2-2'], labels: [5, 6], bestOf: 3 },
    { x: 1310, ys: [605], ids: ['r3-1'], labels: [8], bestOf: 3 }
  ];
  const headings = lang === 'ru' ? ['Плей-офф', 'Полуфинал', 'Финал'] : ['Playoff', 'Semi-final', 'Final'];
  const waiting = lang === 'ru' ? 'Ожидаем результаты…' : 'Awaiting results…';
  const unit = value => (value / 25.6) + 'cqw';
  const place = (node, x, y) => {
    node.style.left = unit(x);
    node.style.top = unit(y);
    return node;
  };
  const line = (x1, y1, x2, y2) => {
    const segment = place(el('span', 'masters-bracket-line'), Math.min(x1, x2), Math.min(y1, y2));
    segment.style.width = unit(Math.max(1, Math.abs(x2 - x1)));
    segment.style.height = unit(Math.max(1, Math.abs(y2 - y1)));
    segment.setAttribute('aria-hidden', 'true');
    root.append(segment);
  };
  const connect = (x, a, b, destination) => {
    const middle = x + 29;
    line(x, a, middle, a);
    line(x, b, middle, b);
    line(middle, a, middle, b);
    line(middle, (a + b) / 2, destination, (a + b) / 2);
  };

  for (const [i, stage] of positions.entries()) {
    line(stage.x + 265, 235, stage.x + 265, stage.ys.at(-1) + 165);
    root.append(place(el('h2', 'masters-bracket-heading', headings[i]), stage.x, 145));
  }
  connect(660, 377.5, 582.5, 720);
  connect(660, 787.5, 992.5, 720);
  connect(1250, 480.5, 890.5, 1310);
  line(1840, 645, 1900, 645);
  line(1840, 730, 1900, 730);

  function playerCard(player, { score, lost = false } = {}) {
    const faction = player?.faction === 'resistance' ? 'resistance' :
      player?.faction === 'confederation' ? 'confederation' : 'neutral';
    const card = el('div', `masters-bracket-card masters-bracket-${faction}${lost ? ' is-eliminated' : ''}`);
    const avatar = player ? playerAvatar(player) : el('span', 'masters-bracket-placeholder');
    avatar.setAttribute('aria-hidden', 'true');
    card.append(avatar, el('span', 'masters-bracket-name', player?.name || waiting));
    if (score !== undefined) card.append(el('span', 'masters-bracket-score', String(score)));
    return card;
  }

  positions.forEach(stage => {
    stage.ids.forEach((id, i) => {
      const match = getMatch(id)?.match;
      const group = place(el('article', 'masters-bracket-match'), stage.x, stage.ys[i]);
      const number = el('span', 'masters-bracket-number', String(stage.labels[i]));
      const rows = el('div', 'masters-bracket-rows');
      for (const side of [0, 1]) {
        rows.append(playerCard(match?.players?.[side], {
          score: (match?.bestOf ?? stage.bestOf) === 3 ? (match ? scoreText(match, side) : 0) : undefined,
          lost: Boolean(match && isComplete(match) && match.winner !== side)
        }));
      }
      group.append(number, rows);
      root.append(group);
    });
  });

  const ranked = id => {
    const match = getMatch(id)?.match;
    return match && isComplete(match) ? [match.players[match.winner], match.players[1 - match.winner]] : [null, null];
  };
  const placements = [...ranked('r3-1'), ...ranked('third')];
  placements.forEach((player, i) => {
    const row = place(el('div', 'masters-bracket-place'), 1900, [605, 690, 810, 895][i]);
    row.append(el('span', `masters-bracket-medal medal-${i + 1}`, String(i + 1)), playerCard(player));
    root.append(row);
  });
  app.append(root);
}

function renderOperator() {
  document.body.className = 'operator-body';
  const shell = el('main', 'operator-shell');
  const top = el('header', 'operator-header');
  const brand = el('div', 'brand'); brand.append(el('div', 'brand-mark', 'AOW'), el('div', 'brand-copy', t.title), el('div', 'brand-subtitle', t.lab));
  top.append(brand);
  const connection = el('div', `connection ${state ? 'online' : ''}`); connection.append(el('i', 'connection-dot'), el('span', '', state ? t.live : t.offline));
  const locale = el('a', 'locale-link', `${t.language}: ${lang.toUpperCase()}`); locale.href = `/?lang=${lang === 'ru' ? 'en' : 'ru'}`;
  const summer = el('a', 'locale-link', lang === 'ru' ? 'САЙТ ТУРНИРА' : 'TOURNAMENT SITE');
  summer.href = `/fall/?lang=${lang}`;
  const figma = el('a', 'locale-link', 'FIGMA JSON');
  figma.href = '/api/state';
  for (const link of [summer, figma]) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  top.append(connection, summer, figma, locale);
  shell.append(top);
  shell.append(el('p', 'game-monitor', gameMonitorText()));
  shell.append(el('p', 'game-monitor pages-monitor', pagesMonitorText()));
  const grid = el('div', 'operator-grid');
  const listPanel = el('section', 'panel rounds-panel');
  listPanel.append(el('h2', '', t.rounds));
  const rounds = state?.rounds || [];
  if (!rounds.length) listPanel.append(el('p', 'muted', t.empty));
  rounds.forEach((round, ri) => {
    const group = el('div', 'round-group'); group.append(el('h3', '', `${t.round} ${ri + 1} · ${roundTitle(round) || ''}`));
    (round.matches || []).forEach(match => {
      const btn = el('button', `match-item ${selectedId === match.id ? 'selected' : ''}`);
      btn.type = 'button'; btn.append(el('span', 'match-item-names', `${playerName(match.players?.[0])}  vs  ${playerName(match.players?.[1])}`));
      btn.append(el('span', 'match-item-score', `${scoreText(match, 0)} : ${scoreText(match, 1)}`));
      btn.addEventListener('click', () => { selectedId = match.id; render(); }); group.append(btn);
    });
    listPanel.append(group);
  });
  grid.append(listPanel);
  const right = el('div', 'operator-right');
  const previewPanel = el('section', 'panel preview-panel'); previewPanel.append(el('h2', '', t.preview));
  const chosen = getMatch(selectedId);
  if (!chosen) previewPanel.append(el('p', 'muted', t.choose));
  else {
    const { match, round } = chosen;
    previewPanel.append(el('div', 'preview-round', roundTitle(round) || ''));
    const preview = el('div', 'preview-score');
    for (let i = 0; i < 2; i++) {
      const p = match.players?.[i];
      const row = el('div', `preview-side ${match.winner === i ? 'winner' : ''}`);
      const id = el('div', 'preview-identity'); id.append(el('strong', '', playerName(p)), el('small', '', [p?.clan, factionName(p)].filter(Boolean).join(' / ')));
      row.append(id, el('b', '', String(scoreText(match, i)))); preview.append(row);
    }
    previewPanel.append(preview, el('div', 'preview-game', `BO${match.bestOf} · ${isComplete(match) ? t.final : `${t.game} ${currentGame(match)}`}`));
    const publish = el('button', 'button primary', t.publish); publish.type = 'button';
    publish.addEventListener('click', async () => { try { state = await request('/api/publish', { method: 'POST', body: JSON.stringify({ id: match.id }) }); statusMessage = t.updated; render(); } catch (e) { statusMessage = e.message; render(); } });
    previewPanel.append(publish);
  }
  const reset = el('button', 'button secondary reset-broadcast', lang === 'ru' ? 'СБРОСИТЬ ЭФИР' : 'RESET LIVE');
  reset.type = 'button';
  reset.disabled = !state?.publishedId;
  reset.addEventListener('click', async () => {
    reset.disabled = true;
    try {
      state = await request('/api/reset', { method: 'POST', body: '{}' });
      statusMessage = lang === 'ru' ? 'Эфир сброшен. Результаты сохранены.' : 'Live match cleared. Results kept.';
    } catch (error) {
      statusMessage = error.message;
    }
    render();
  });
  previewPanel.append(reset);
  right.append(previewPanel);
  const resultPanel = el('section', 'panel result-panel'); resultPanel.append(el('h2', '', t.result));
  if (!chosen) resultPanel.append(el('p', 'muted', t.select));
  else {
    const { match } = chosen;
    const form = el('form', 'result-form');
    for (let i = 0; i < 2; i++) {
      const label = el('label', 'score-input'); label.append(el('span', '', `${playerName(match.players?.[i])} · ${t.score}`));
      const input = el('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.required = true; input.value = String(scoreText(match, i)); label.append(input); form.append(label);
    }
    const submit = el('button', 'button secondary', t.submit); submit.type = 'submit'; form.append(submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!window.confirm(t.confirm)) return;
      try { state = await request('/api/result', { method: 'POST', body: JSON.stringify({ id: match.id, scores: [...form.querySelectorAll('input')].map(input => Number(input.value)), revision: state?.revision }) }); statusMessage = t.saved; render(); }
      catch (e) { statusMessage = e.message; render(); }
    });
    resultPanel.append(form);
  }
  right.append(resultPanel); grid.append(right); shell.append(grid);
  const foot = el('footer', 'operator-footer'); foot.append(el('span', '', statusMessage || 'AOW · MASTERS LAB'));
  if (state?.revision !== undefined) foot.append(el('span', '', `REV ${state.revision}`)); shell.append(foot);
  app.append(shell);
}

async function poll() {
  try {
    let next;
    if (shared) {
      const feed = document.documentElement.dataset.feed;
      const response = await fetch(feed + '?v=' + Math.floor(Date.now() / 5000), { cache: 'no-store' }).catch(() => null);
      next = response?.ok ? await response.json() : state ?? await request('state.json');
    } else {
      next = await request('/api/state');
    }
    if (!state || next.revision > state.revision) {
      state = next;
      if (!getMatch(selectedId)) selectedId = '';
      render();
    }
  }
  catch { if (!state) render(); }
  window.setTimeout(poll, shared ? 5000 : 1000);
}

let pagesStatus;
function pagesMonitorText() {
  const labels = lang === 'ru'
    ? { disabled: 'GitHub: синхронизация выключена', pending: 'GitHub: отправляем обновление…', retrying: 'GitHub: повторяем отправку…', synced: 'GitHub: данные отправлены' }
    : { disabled: 'GitHub: sync disabled', pending: 'GitHub: sending update…', retrying: 'GitHub: retrying…', synced: 'GitHub: data sent' };
  return labels[pagesStatus?.phase] ?? '';
}

async function pollPages() {
  try {
    pagesStatus = await request('/api/pages');
    const monitor = app.querySelector('.pages-monitor');
    if (monitor) monitor.textContent = pagesMonitorText();
  } catch {}
  window.setTimeout(pollPages, 1500);
}

function gameMonitorText() {
  const labels = lang === 'ru'
    ? { unavailable: 'Журнал игры недоступен', waiting: 'Ожидание боя', loading: 'Загрузка', playing: 'В бою', finished: 'Бой завершён', battle: 'Бой', alliance: 'Альянс' }
    : { unavailable: 'Game log unavailable', waiting: 'Waiting for battle', loading: 'Loading', playing: 'In battle', finished: 'Battle finished', battle: 'Battle', alliance: 'Alliance' };
  if (!gameStatus?.available) return labels.unavailable;
  return [gameStatus.battleId && `${labels.battle} #${gameStatus.battleId}`, labels[gameStatus.phase] || labels.waiting,
    gameStatus.alliance != null && `${labels.alliance} ${gameStatus.alliance}`].filter(Boolean).join(' · ');
}

async function pollGame() {
  try {
    gameStatus = await request('/api/game');
  } catch {
    gameStatus = null;
  }
  const monitor = app.querySelector('.game-monitor');
  const label = gameMonitorText();
  if (monitor && monitor.textContent !== label) monitor.textContent = label;
  window.setTimeout(pollGame, 1000);
}

prepareCues();
render();
poll();
if (view === 'operator') {
  pollGame();
  pollPages();
}
