const form = document.querySelector('#guess-form');
const betToggle = document.querySelector('#wants-bet');
const receiptArea = document.querySelector('#receipt-area');
const receiptInput = document.querySelector('#receipt');
const fileName = document.querySelector('#file-name');
const guessDate = document.querySelector('#guess-date');
const guessTime = document.querySelector('#guess-time');
const birthDatetime = document.querySelector('#birth-datetime');
const message = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-button');
const leaderboardList = document.querySelector('#leaderboard-list');
const stats = document.querySelector('#stats');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const panels = [...document.querySelectorAll('[data-panel]')];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const argentinaDate = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Cordoba', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

let turnstileWidgetId = null;
let turnstileConfigured = false;
let turnstileApiPromise = null;

function populateGuessDates() {
  const start = new Date(2026, 6, 23);
  const end = new Date(2026, 7, 28);
  const formatter = new Intl.DateTimeFormat('es-AR', { month: 'long' });
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = `${value === '2026-08-14' ? '★ ' : ''}${date.getDate()} ${formatter.format(date)}`;
    guessDate.append(option);
  }
}

function syncBirthDatetime() {
  birthDatetime.value = guessDate.value && guessTime.value ? `${guessDate.value}T${guessTime.value}` : '';
}

function syncBetUI() {
  receiptArea.hidden = !betToggle.checked;
  receiptInput.required = betToggle.checked;
  betToggle.setAttribute('aria-expanded', String(betToggle.checked));
}

betToggle.addEventListener('change', syncBetUI);
guessDate.addEventListener('change', syncBirthDatetime);
guessTime.addEventListener('input', () => {
  const digits = guessTime.value.replace(/\D/g, '').slice(0, 4);
  guessTime.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  syncBirthDatetime();
});
window.addEventListener('pageshow', syncBetUI);

receiptInput.addEventListener('change', () => {
  const selected = receiptInput.files[0];
  fileName.textContent = selected ? selected.name : 'Elegir archivo';
});

function setMessage(type, text) {
  message.className = `form-message${type ? ` ${type}` : ''}`;
  message.textContent = text;
}

function loadTurnstileApi() {
  if (typeof window.turnstile?.render === 'function') return Promise.resolve(window.turnstile);
  if (turnstileApiPromise) return turnstileApiPromise;

  turnstileApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-turnstile-api]');
    const script = existingScript || document.createElement('script');
    const timeoutId = window.setTimeout(() => reject(new Error('Turnstile no respondió.')), 12000);
    const finish = () => {
      window.clearTimeout(timeoutId);
      if (typeof window.turnstile?.render === 'function') resolve(window.turnstile);
      else reject(new Error('La API de Turnstile no quedó disponible.'));
    };
    const fail = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('No se pudo descargar la API de Turnstile.'));
    };

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!existingScript) {
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.defer = true;
      script.dataset.turnstileApi = '';
      document.head.append(script);
    }
  });

  return turnstileApiPromise;
}

async function mountTurnstile(siteKey) {
  if (turnstileWidgetId !== null) return;
  const api = await loadTurnstileApi();
  const container = document.querySelector('#turnstile-widget');
  turnstileWidgetId = api.render(container, {
    sitekey: siteKey,
    theme: 'light',
    size: 'flexible',
    action: 'turnstile-spin-v2',
    callback: () => setMessage('', ''),
    'expired-callback': () => setMessage('error', 'La verificación venció. Completala nuevamente.'),
    'error-callback': () => setMessage('error', 'No pudimos cargar la verificación anti-bots. Recargá la página para participar.')
  });
}

function resetTurnstile() {
  if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error();
    const config = await response.json();
    if (!config.turnstileSiteKey) {
      if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) throw new Error('missing-key');
      return;
    }
    await mountTurnstile(config.turnstileSiteKey);
    turnstileConfigured = true;
  } catch {
    setMessage('error', 'No pudimos iniciar la protección anti-bots. Recargá la página para participar.');
    submitButton.disabled = true;
  }
}

async function loadGuesses() {
  leaderboardList.innerHTML = '<p class="loading">Cargando corazonadas…</p>';
  try {
    const response = await fetch('/api/guesses');
    if (!response.ok) throw new Error();
    const guesses = await response.json();
    stats.innerHTML = `<span><b>${guesses.length}</b> ${guesses.length === 1 ? 'predicción' : 'predicciones'}</span><span>·</span><span>Cada fecha, hora y peso es único</span>`;
    leaderboardList.innerHTML = guesses.length ? guesses.map((guess, index) => `
      <article class="guess-row">
        <span class="rank">${String(index + 1).padStart(2, '0')}</span>
        <span class="name">${escapeHtml(guess.nickname)}</span>
        <time class="date" datetime="${escapeHtml(guess.birth_datetime)}">${argentinaDate.format(new Date(guess.birth_datetime))}</time>
        <span class="weight">${Number(guess.weight_grams).toLocaleString('es-AR')} g</span>
        ${guess.wants_bet ? '<span class="bet-badge">VAQUITA ♡</span>' : ''}
      </article>`).join('') : '<p class="empty">Todavía no hay predicciones. ¡Podés inaugurar la lista! 🌼</p>';
  } catch {
    leaderboardList.innerHTML = '<p class="empty">No pudimos cargar las predicciones. Probá nuevamente en un ratito.</p>';
  }
}

function showView(view, updateUrl = true) {
  panels.forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
  viewButtons.forEach((button) => {
    const active = button.dataset.view === view;
    if (button.classList.contains('view-button')) button.classList.toggle('is-active', active);
    if (button.classList.contains('view-button')) button.setAttribute('aria-pressed', String(active));
  });
  if (updateUrl) history.replaceState(null, '', view === 'leaderboard' ? '#leaderboard' : '#participar');
  if (view === 'leaderboard') loadGuesses();
}

viewButtons.forEach((button) => button.addEventListener('click', () => {
  const view = button.dataset.view;
  showView(view);
  document.querySelector(`[data-panel="${view}"]`).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('', '');
  syncBirthDatetime();
  if (!form.reportValidity()) return;
  const file = receiptInput.files[0];
  if (file && file.size > 5 * 1024 * 1024) {
    setMessage('error', 'El comprobante no puede superar los 5 MB.');
    return;
  }
  const token = form.querySelector('input[name="cf-turnstile-response"]')?.value;
  if (turnstileConfigured && !token) {
    setMessage('error', 'Completá la verificación para guardar tu predicción.');
    return;
  }
  submitButton.disabled = true;
  submitButton.childNodes[0].nodeValue = 'Guardando… ';
  try {
    const response = await fetch('/api/guesses', { method: 'POST', body: new FormData(form) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'No pudimos guardar tu predicción.');
    form.reset();
    syncBirthDatetime();
    syncBetUI();
    fileName.textContent = 'Elegir archivo';
    resetTurnstile();
    showView('leaderboard');
    document.querySelector('#leaderboard').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  } catch (error) {
    setMessage('error', error.message);
    resetTurnstile();
  } finally {
    submitButton.disabled = false;
    submitButton.childNodes[0].nodeValue = 'Guardar mi predicción ';
  }
});

document.querySelector('#refresh-button').addEventListener('click', loadGuesses);
populateGuessDates();
syncBetUI();
showView(window.location.hash === '#leaderboard' ? 'leaderboard' : 'participate', false);
loadConfig();
