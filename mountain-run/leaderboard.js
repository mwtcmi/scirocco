(() => {
  'use strict';
  const API = 'https://scirocco799-leaderboard.mr-mikewhite.workers.dev';
  const RULESET = '2027-v5', PROFILE_KEY = '799-podium-driver-v1', PENDING_KEY = '799-podium-pending-v1';
  const $ = id => document.getElementById(id), game = window.MountainRun, dialog = $('podiumDialog');
  if (!game || !dialog) return;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  let profile = read(PROFILE_KEY, null);
  if (!profile || !/^[0-9a-f-]{36}$/i.test(profile.playerId) || !/^[0-9a-f]{64}$/i.test(profile.token)) profile = null;
  let pending = read(PENDING_KEY, []);
  if (!Array.isArray(pending)) pending = [];
  pending = pending.filter(p => p && p.playerId === profile?.playerId && typeof p.runId === 'string' && p.expiresAt > Date.now()).slice(-10);
  let selected = game.events[0].id, active = null, finishView = null, readiness = null, readyUntil = 0, profilePromise = null;
  let boardGeneration = 0, declinedName = false;
  const submitting = new Map();
  class ServiceError extends Error { constructor(message, status = 0) { super(message); this.status = status; } }
  function time(ms) {
    const minutes = Math.floor(ms / 60000), seconds = Math.floor(ms % 60000 / 1000), fraction = ms % 1000;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') + '.' + String(fraction).padStart(3, '0');
  }
  async function request(path, { data, auth = false } = {}) {
    const headers = {};
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && profile) headers.Authorization = 'Bearer ' + profile.token;
    let response, result;
    try {
      response = await fetch(API + path, { method: data === undefined ? 'GET' : 'POST', headers,
        body: data === undefined ? undefined : JSON.stringify(data), credentials: 'omit', signal: AbortSignal.timeout(6000) });
      result = await response.json();
    } catch { throw new ServiceError('Podiums are temporarily unavailable. You can keep racing.'); }
    if (!response.ok) throw new ServiceError(result.error || 'The result could not be posted.', response.status);
    return result;
  }
  function ready(force = false) {
    if (!force && readiness && Date.now() < readyUntil) return readiness;
    readyUntil = Date.now() + 30000;
    readiness = request('/api/health').then(r => r.ok === true && r.ruleset === RULESET).catch(() => false);
    return readiness;
  }
  async function identity() {
    if (profile) return profile;
    if (!profilePromise) profilePromise = request('/api/players', { data: {} }).then(p => {
      if (!p.playerId || !p.token) throw new ServiceError('Podiums are still coming online. You can keep racing.');
      profile = p; save(PROFILE_KEY, profile); updateDriver(); return profile;
    }).finally(() => { profilePromise = null; });
    return profilePromise;
  }
  function updateDriver() {
    $('podiumDriver').textContent = profile?.name ? 'DRIVER · ' + profile.name : 'Choose a name to post your times.';
    $('driverEdit').textContent = profile?.name ? 'EDIT NAME' : 'ADD NAME';
    $('driverInput').value = profile?.name || '';
    $('podiumOpen').classList.toggle('pending', pending.length > 0);
  }
  function persistPending() { save(PENDING_KEY, pending); updateDriver(); }
  function status(text, crown = false) {
    $('podiumStatus').textContent = text; $('podiumStatus').classList.toggle('crowned', crown);
  }
  function current(view) { return !!view && finishView === view && $('game').classList.contains('results'); }
  function finishStatus(view, text, state = 'waiting') {
    if (!current(view)) return;
    $('sharedFinish').hidden = false; $('sharedFinish').textContent = text; $('sharedFinish').dataset.state = state;
  }
  function clearBoard() {
    for (const place of dialog.querySelectorAll('.podium-place')) {
      place.querySelector('.place-name').textContent = '—'; place.querySelector('.place-time').textContent = '—'; place.classList.remove('mine');
    }
    $('podiumRows').replaceChildren(); $('podiumSelf').textContent = 'Finish an event to post your first time.';
  }
  function renderBoard(board) {
    for (const place of dialog.querySelectorAll('.podium-place')) {
      const entry = board.entries.find(p => p.rank === Number(place.dataset.rank));
      place.querySelector('.place-name').textContent = entry?.name || 'Open spot';
      place.querySelector('.place-time').textContent = entry ? time(entry.timeMs) : '—';
      place.classList.toggle('mine', !!entry && entry.playerId === profile?.playerId);
      place.querySelector('.place-title').textContent = place.dataset.rank === '1' ? (board.eventId === 'season' ? 'SEASON CHAMPION' : 'KING OF THE HILL') : 'PODIUM';
    }
    const rows = board.entries.map(entry => {
      const row = document.createElement('tr'); row.classList.toggle('mine', entry.playerId === profile?.playerId);
      for (const value of [entry.rank, entry.name, time(entry.timeMs)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
      return row;
    });
    $('podiumRows').replaceChildren(...rows);
    if (board.self) {
      const gap = board.self.timeMs - board.entries[0].timeMs;
      $('podiumSelf').textContent = 'YOUR BEST · #' + board.self.rank + ' · ' + time(board.self.timeMs)
        + (gap > 0 ? ' · +' + (gap / 1000).toFixed(3) + 's to the crown' : board.self.rank === 1 ? ' · YOU HOLD THE CROWN' : ' · Tied time; earlier finish leads.');
    } else if (board.eventId === 'season') {
      $('podiumSelf').textContent = 'YOUR SEASON · ' + (board.progress?.completed || 0) + ' / 9 events posted. Finish all nine to qualify.';
    } else $('podiumSelf').textContent = 'Finish this event and post a time to claim your place.';
    $('podiumNote').textContent = board.eventId === 'season'
      ? 'Season order uses the sum of your best times across all nine events. Equal totals favor the earlier completed set.'
      : 'One best time per driver. Equal times favor the earlier result. Only new runs with shared timing qualify.';
  }
  async function loadBoard(force = false) {
    const generation = ++boardGeneration, eventId = $('podiumEvent').value;
    status('Loading shared times…'); clearBoard();
    if (!await ready(force)) {
      if (generation === boardGeneration) status('Podiums are temporarily unavailable. Device bests still save; keep racing.');
      return;
    }
    try {
      const board = await request('/api/leaderboard?event=' + encodeURIComponent(eventId) + (profile ? '&player=' + encodeURIComponent(profile.playerId) : ''));
      if (generation !== boardGeneration) return;
      if (board.ruleset !== RULESET || !Array.isArray(board.entries)) throw new ServiceError('Podiums are still coming online.');
      renderBoard(board);
      const waiting = profile?.name && pending.filter(p => p.eventId === eventId);
      if (waiting?.length) status(waiting.some(p => submitting.has(p.runId)) ? 'Posting your time…' : 'Your time is waiting to post. Reconnect and tap Refresh to retry.');
      else status(board.total ? board.total + (board.total === 1 ? ' driver ranked.' : ' drivers ranked.') : eventId === 'season' ? 'The season crown is waiting for its first complete set.' : 'The crown is waiting. Post the first time.');
    } catch (error) { if (generation === boardGeneration) status(error.message); }
  }
  function nameForm(show) {
    $('driverForm').hidden = !show; $('nameError').textContent = '';
    if (show) { $('driverInput').value = profile?.name || ''; $('driverInput').focus(); }
  }
  function open(eventId = selected, askName = false) {
    game.pauseForPodium();
    $('podiumEvent').value = eventId; updateDriver();
    if (!dialog.open) dialog.showModal();
    nameForm(askName || (!profile?.name && pending.length > 0));
    loadBoard();
  }
  function close() {
    if (finishView) finishView.dismissed = true;
    if (dialog.open) dialog.close();
  }
  function addPending(entry) {
    if (!pending.some(p => p.runId === entry.runId)) pending.push(entry);
    pending = pending.filter(p => p.expiresAt > Date.now()).slice(-10); persistPending();
  }
  function publish(entry, view) {
    if (submitting.has(entry.runId)) return submitting.get(entry.runId);
    const promise = (async () => {
      try {
        const result = await request('/api/runs/' + encodeURIComponent(entry.runId) + '/finish', { auth: true, data: { timeMs: entry.timeMs, apexes: entry.apexes } });
        if (result.accepted !== true || !result.leaderboard) throw new ServiceError('The result could not be confirmed.');
        pending = pending.filter(p => p.runId !== entry.runId); persistPending();
        const board = result.leaderboard;
        if (board.self && profile) { profile.name = board.self.name; save(PROFILE_KEY, profile); updateDriver(); }
        const text = (result.newKing ? 'YOU TOOK THE CROWN! · ' : 'TIME POSTED · ') + (board.self ? '#' + board.self.rank + ' · ' + time(board.self.timeMs) : time(entry.timeMs));
        finishStatus(view, text, 'posted');
        if (dialog.open && $('podiumEvent').value === entry.eventId) {
          ++boardGeneration; renderBoard(board); status(text, result.newKing);
        }
        return true;
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          pending = pending.filter(p => p.runId !== entry.runId); persistPending();
          finishStatus(view, error.message + ' Device best saved.');
          if (dialog.open) status(error.message);
        } else {
          finishStatus(view, 'Device best saved. Posting will retry when you reconnect.');
          if (dialog.open) status('Your time is waiting to post. Reconnect and tap Refresh to retry.');
        }
        return false;
      }
    })().finally(() => submitting.delete(entry.runId));
    submitting.set(entry.runId, promise); return promise;
  }
  async function flush() {
    if (!profile?.name || !await ready()) return;
    for (const entry of [...pending]) {
      if (entry.playerId !== profile.playerId) continue;
      if (entry.expiresAt <= Date.now()) { pending = pending.filter(p => p !== entry); persistPending(); continue; }
      await publish(entry, finishView?.entry?.runId === entry.runId ? finishView : null);
    }
  }
  window.MountainLeaderboard = {
    isOpen: () => dialog.open,
    select: eventId => { selected = eventId; },
    start(eventId) {
      close(); finishView = null; $('sharedFinish').hidden = true; selected = eventId;
      const run = { eventId }; active = run;
      run.promise = (async () => {
        if (!await ready()) return null;
        await identity();
        const ticket = await request('/api/runs', { auth: true, data: { eventId, ruleset: RULESET } });
        if (ticket.ruleset !== RULESET || !ticket.runId || ticket.eventId !== eventId) return null;
        return ticket;
      })().catch(() => null);
    },
    finish(result) {
      const run = active; active = null;
      if (!result || !run) { $('sharedFinish').hidden = true; return; }
      const view = { ...result, dismissed: false }; finishView = view;
      finishStatus(view, 'Device best saved. Preparing shared result…');
      run.promise.then(async ticket => {
        if (!ticket) { finishStatus(view, 'Device best saved · shared timing unavailable for this run.'); return; }
        const entry = { ...ticket, playerId: profile.playerId, timeMs: result.timeMs, apexes: result.apexes };
        view.entry = entry; addPending(entry);
        if (current(view) && !view.dismissed && (profile.name || !declinedName)) open(result.eventId, !profile.name);
        if (profile.name) await publish(entry, view);
        else finishStatus(view, 'Device best saved · tap PODIUMS to add your name and post.');
      }).catch(() => finishStatus(view, 'Device best saved · shared result unavailable.'));
    }
  };
  for (const event of [...game.events, { id: 'season', name: 'Full 2027 Season' }]) {
    const option = document.createElement('option'); option.value = event.id; option.textContent = event.name; $('podiumEvent').append(option);
  }
  $('podiumOpen').hidden = false; $('podiumOpen').onclick = () => open();
  $('podiumOpen').addEventListener('keydown', event => { if (event.key === ' ') event.stopPropagation(); });
  $('podiumClose').onclick = close; $('podiumContinue').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('podiumEvent').onchange = () => loadBoard();
  $('podiumRefresh').onclick = async () => { await loadBoard(true); await flush(); };
  $('driverEdit').onclick = () => nameForm(true);
  $('driverSkip').onclick = () => { declinedName = true; close(); };
  $('driverForm').onsubmit = async event => {
    event.preventDefault(); $('nameError').textContent = ''; $('driverSave').disabled = true;
    try {
      if (!await ready(true)) throw new ServiceError('Podiums are temporarily unavailable. Your device best is saved.');
      await identity();
      const named = await request('/api/profile', { auth: true, data: { name: $('driverInput').value } });
      profile.name = named.name; const remembered = save(PROFILE_KEY, profile); declinedName = false; updateDriver(); nameForm(false);
      await loadBoard(); await flush();
      if (!remembered) status('Your name is remembered for this visit. Browser storage is unavailable.');
    } catch (error) { $('nameError').textContent = error.message; $('driverInput').focus(); }
    finally { $('driverSave').disabled = false; }
  };
  updateDriver();
  addEventListener('online', () => { ready(true).then(() => flush()); });
  ready().then(() => flush());
})();
