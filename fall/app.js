const copy = {
  ru: ['Навигация по странице', 'Язык', 'Сетка', 'Плей-офф', 'Турнирная сетка', 'Турнирная сетка', '', 'Четвертьфинал', 'Полуфинал', 'Финал', 'Матч за 3-е место', 'Ожидаем результаты…', 'Загрузка сетки…'],
  en: ['Page navigation', 'Language', 'Bracket', 'Playoffs', 'Tournament bracket', 'Tournament bracket', '', 'Quarterfinal', 'Semifinal', 'Final', 'Third-place match', 'Awaiting results…', 'Loading bracket…']
};
const query = new URLSearchParams(location.search);
const languageSelect = document.querySelector('#language-select');
const content = document.querySelector('#bracket-content');
let language = query.get('lang') === 'en' ? 'en' : 'ru';
let state;

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function row(player, match, side, t) {
  const faction = ['confederation', 'resistance'].includes(player?.faction) ? player.faction : 'neutral';
  const lost = match.winner !== null && match.winner !== side;
  const el = node('div', 'player player-' + faction + (player ? '' : ' player-empty') + (lost ? ' is-eliminated' : ''));
  const avatar = node('span', 'avatar fall-avatar');
  if (/^\/fall-portraits\/\d+\.webp$/.test(player?.portrait ?? '')) {
    const img = node('img');
    img.src = '..' + player.portrait;
    img.alt = '';
    img.addEventListener('error', () => img.remove(), { once: true });
    avatar.append(img);
  }
  const info = node('span', 'player-copy');
  info.append(node('span', 'player-name', player?.name ?? t[11]));
  if (player?.clan) info.append(node('span', 'clan-name', player.clan));
  el.append(avatar, info, node('b', 'player-score', match.scores[side]));
  return el;
}

function render() {
  const t = copy[language];
  const labels = { navigationLabel: t[0], languageLabel: t[1], navBracket: t[2], mainStage: t[3],
    bracketTitle: t[4], bracketLabel: t[5], bracketHint: t[6], footer: "Art of War Masters '26 Fall · Community tournament" };
  document.documentElement.lang = language;
  languageSelect.value = language;
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = labels[el.dataset.i18n]);
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => el.setAttribute('aria-label', labels[el.dataset.i18nAriaLabel]));
  content.replaceChildren();
  if (!state) {
    content.append(node('p', 'fall-loading', t[12]));
    return;
  }
  const positions = [[1, 3, 5, 7], [2, 6], [4], [7]];
  state.rounds.forEach((round, index) => {
    const group = node('section', 'fall-round fall-round-' + index);
    const header = node('header');
    header.append(node('h3', '', t[7 + index]), node('span', '', 'BO' + round.matches[0].bestOf));
    group.append(header);
    round.matches.forEach((match, i) => {
      const card = node('article', 'match fall-match');
      card.style.gridRow = positions[index][i];
      card.dataset.match = match.id;
      card.append(...match.players.map((player, side) => row(player, match, side, t)));
      group.append(card);
    });
    content.append(group);
  });
}

languageSelect.addEventListener('change', () => {
  language = languageSelect.value;
  query.set('lang', language);
  history.replaceState(null, '', '?' + query + location.hash);
  render();
});

const shared = document.documentElement.dataset.mode === 'pages';
async function poll() {
  try {
    const response = await fetch(shared ? '../state.json' : '../api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status);
    const next = await response.json();
    if (!state || state.revision !== next.revision) {
      state = next;
      render();
    }
  } catch (error) {
    console.warn('Fall bracket update failed:', error);
  } finally {
    window.setTimeout(poll, shared ? 15000 : 1500);
  }
}

render();
poll();
