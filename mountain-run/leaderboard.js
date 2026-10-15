(() => {
  'use strict';
  const API = 'https://scirocco799-leaderboard.mr-mikewhite.workers.dev';
  // Cached V5 HTML can receive this newer script; it must keep its old scoring rules.
  const RULESET = window.MountainCourses?.ruleset || '2027-v5', PROFILE_KEY = '799-podium-driver-v1', PENDING_KEY = RULESET === '2027-v5' ? '799-podium-pending-v1' : '799-podium-pending-v6', NAME_KEY = '799-podium-name-v1';
  const $ = id => document.getElementById(id), game = window.MountainRun, dialog = $('podiumDialog');
  if (!game || !dialog) return;
  const namePolicy = window.createDriverNamePolicy?.();
  const nameError = name => namePolicy?.error(name) || '';
  const publicName = entry => namePolicy ? namePolicy.publicName(entry.name, entry.playerId) : entry.name;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  let profile = read(PROFILE_KEY, null);
  if (!profile || !/^[0-9a-f-]{36}$/i.test(profile.playerId) || !/^[0-9a-f]{64}$/i.test(profile.token)) profile = null;
  let draftName = read(NAME_KEY, '');
  if (typeof draftName !== 'string') draftName = '';
  draftName = draftName || profile?.name || '';
  if (profile?.name && nameError(profile.name)) { profile.name = null; save(PROFILE_KEY, profile); }
  let pending = read(PENDING_KEY, []);
  if (!Array.isArray(pending)) pending = [];
  pending = pending.filter(p => p && p.ruleset === RULESET && p.playerId === profile?.playerId && typeof p.runId === 'string' && p.expiresAt > Date.now()).slice(-10);
  let selected = game.events[0].id, active = null, finishView = null, readiness = null, readyUntil = 0, profilePromise = null;
  let boardGeneration = 0, declinedName = false, serviceIssue = 'offline', nameProblem = nameError(draftName), nameSync = null;
  let welcomeGeneration = 0;
  const welcomeBoards = new Map();
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
    readiness = request('/api/health').then(r => {
      if (r.ok === true && r.ruleset === RULESET) { serviceIssue = ''; return true; }
      serviceIssue = r.ok === true ? 'version' : 'setup'; return false;
    }).catch(() => { serviceIssue = 'offline'; return false; });
    return readiness;
  }
  function showHillLeader(board) {
    if (!$('welcomeCrown')) return;
    const leader = board?.entries?.find(entry => entry.rank === 1);
    $('hillLeader').textContent = leader ? publicName(leader) : 'Crown unclaimed';
    $('hillRecord').textContent = leader ? time(leader.timeMs) : 'Set the first time';
    $('welcomeCrown').dataset.state = 'ready';
  }
  function rememberHillLeader(board) {
    if (board.eventId === 'season') return;
    welcomeBoards.set(board.eventId, { board, expires: Date.now() + 30000 });
    if (board.eventId === selected) { ++welcomeGeneration; showHillLeader(board); }
  }
  async function refreshHillLeader() {
    if (!$('welcomeCrown')) return;
    const generation = ++welcomeGeneration, eventId = selected, cached = welcomeBoards.get(eventId);
    if (cached && cached.expires > Date.now()) { showHillLeader(cached.board); return; }
    $('hillLeader').textContent = 'Checking the hill…'; $('hillRecord').textContent = '—';
    $('welcomeCrown').dataset.state = 'loading';
    try {
      if (!await ready()) throw new ServiceError('offline');
      const board = await request('/api/leaderboard?event=' + encodeURIComponent(eventId));
      if (board.ruleset !== RULESET || board.eventId !== eventId || !Array.isArray(board.entries)) throw new ServiceError('offline');
      if (generation !== welcomeGeneration || selected !== eventId) return;
      rememberHillLeader(board);
    } catch {
      if (generation !== welcomeGeneration || selected !== eventId) return;
      $('hillLeader').textContent = 'Race for the crown'; $('hillRecord').textContent = 'Times reconnect later';
      $('welcomeCrown').dataset.state = 'offline';
    }
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
    $('podiumDriver').textContent = profile?.name ? 'DRIVER · ' + profile.name : nameError(draftName) ? 'Choose a different driver name.' : draftName ? 'YOUR DRIVER · ' + draftName : 'Set your driver name on the start screen.';
    $('driverEdit').hidden = !profile?.name && !draftName;
    if (document.activeElement !== $('driverInput')) $('driverInput').value = draftName || profile?.name || '';
    if ($('welcomeDriverInput') && document.activeElement !== $('welcomeDriverInput')) $('welcomeDriverInput').value = draftName || profile?.name || '';
    $('podiumOpen').classList.toggle('pending', pending.length > 0);
  }
  function nameNote(text, error = false) {
    if (!$('welcomeDriverNote')) return;
    $('welcomeDriverNote').textContent = text; $('welcomeDriverNote').classList.toggle('error', error);
    $('welcomeDriverInput')?.setAttribute('aria-invalid', String(error));
  }
  function rememberName() {
    if (!$('welcomeDriverInput')) return;
    draftName = $('welcomeDriverInput').value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (!draftName && profile?.name) draftName = profile.name;
    nameProblem = nameError(draftName);
    if (!nameProblem) save(NAME_KEY, draftName);
    updateDriver();
  }
  async function syncName(force = false) {
    nameProblem = nameError(draftName);
    if (nameProblem) { nameNote(nameProblem, true); return; }
    if (!draftName || profile?.name === draftName) return;
    if (nameSync) { await nameSync; if (profile?.name === draftName) return; }
    const name = draftName;
    nameSync = (async () => {
      if (!await ready(force)) { nameNote('Name remembered here. Shared podiums reconnect later.'); return; }
      await identity();
      try {
        const named = await request('/api/profile', { auth: true, data: { name } });
        profile.name = named.name; save(PROFILE_KEY, profile);
        if (draftName === name) { draftName = named.name; save(NAME_KEY, draftName); nameProblem = ''; nameNote('Ready for the shared podiums.'); updateDriver(); }
      } catch (error) {
        if (draftName === name) { nameProblem = error.status >= 400 && error.status < 500 ? error.message : ''; nameNote(nameProblem || 'Name remembered here. Shared podiums reconnect later.', !!nameProblem); }
      }
    })().catch(() => nameNote('Name remembered here. Shared podiums reconnect later.')).finally(() => { nameSync = null; });
    await nameSync;
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
    const season = $('podiumEvent').value === 'season';
    for (const place of dialog.querySelectorAll('.podium-place')) {
      place.querySelector('.place-name').textContent = '—'; place.querySelector('.place-time').textContent = '—'; place.classList.remove('mine');
      place.querySelector('.place-title').textContent = place.dataset.rank === '1' ? (season ? 'SEASON CHAMPION' : 'KING OF THE HILL') : 'PODIUM';
    }
    $('podiumRows').replaceChildren(); $('podiumSelf').textContent = season ? 'Finish and post all nine events to qualify for the season podium.' : 'Finish this hill to post your first time.';
  }
  function renderBoard(board) {
    rememberHillLeader(board);
    for (const place of dialog.querySelectorAll('.podium-place')) {
      const entry = board.entries.find(p => p.rank === Number(place.dataset.rank));
      place.querySelector('.place-name').textContent = entry ? publicName(entry) : 'Open spot';
      place.querySelector('.place-time').textContent = entry ? time(entry.timeMs) : '—';
      place.classList.toggle('mine', !!entry && entry.playerId === profile?.playerId);
      place.querySelector('.place-title').textContent = place.dataset.rank === '1' ? (board.eventId === 'season' ? 'SEASON CHAMPION' : 'KING OF THE HILL') : 'PODIUM';
    }
    const rows = board.entries.map(entry => {
      const row = document.createElement('tr'); row.classList.toggle('mine', entry.playerId === profile?.playerId);
      for (const value of [entry.rank, publicName(entry), time(entry.timeMs)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
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
    dialog.dataset.state = 'loading'; status('Loading shared times…'); clearBoard();
    if (!await ready(force)) {
      if (generation === boardGeneration) {
        dialog.dataset.state = 'offline';
        status(serviceIssue === 'setup' ? 'Shared podiums are not online yet. Your best times still save on this device.' : serviceIssue === 'version' ? 'Shared podiums are updating for the new courses. Your best times still save here.' : 'Shared podiums cannot be reached right now. Your best times still save here. Tap Refresh to reconnect.');
      }
      return;
    }
    try {
      const board = await request('/api/leaderboard?event=' + encodeURIComponent(eventId) + (profile ? '&player=' + encodeURIComponent(profile.playerId) : ''));
      if (generation !== boardGeneration) return;
      if (board.ruleset !== RULESET || !Array.isArray(board.entries)) throw new ServiceError('Podiums are still coming online.');
      dialog.dataset.state = 'ready'; renderBoard(board);
      const waiting = profile?.name && pending.filter(p => p.eventId === eventId);
      if (waiting?.length) status(waiting.some(p => submitting.has(p.runId)) ? 'Posting your time…' : 'Your time is waiting to post. Reconnect and tap Refresh to retry.');
      else status(board.total ? board.total + (board.total === 1 ? ' driver ranked.' : ' drivers ranked.') : eventId === 'season' ? 'The season crown is waiting for its first complete set.' : 'The crown is waiting. Post the first time.');
    } catch (error) { if (generation === boardGeneration) { dialog.dataset.state = 'offline'; status(error.message); } }
  }
  function nameForm(show) {
    $('driverForm').hidden = !show; $('nameError').textContent = show ? nameProblem : '';
    if (show) { $('driverInput').value = draftName || profile?.name || ''; $('driverInput').focus(); }
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
        rememberHillLeader(board);
        if (board.self && profile) { profile.name = nameError(board.self.name) ? null : board.self.name; save(PROFILE_KEY, profile); updateDriver(); }
        const text = (result.newKing ? 'YOU TOOK THE CROWN! · ' : 'TIME POSTED · ') + (board.self ? '#' + board.self.rank + ' · ' + time(board.self.timeMs) : time(entry.timeMs));
        finishStatus(view, text, 'posted');
        if (dialog.open && $('podiumEvent').value === entry.eventId) {
          ++boardGeneration; dialog.dataset.state = 'ready'; renderBoard(board); status(text, result.newKing);
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
    select: eventId => { selected = eventId; refreshHillLeader(); },
    start(eventId) {
      rememberName();
      close(); finishView = null; $('sharedFinish').hidden = true; selected = eventId;
      const run = { eventId }; active = run;
      run.promise = (async () => {
        if (!await ready()) return null;
        await identity();
        await syncName();
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
  if ($('welcomeCrown')) {
    $('welcomeCrown').onclick = () => open(selected);
    $('welcomeCrown').addEventListener('keydown', event => { if (event.key === ' ') event.stopPropagation(); });
  }
  $('podiumOpen').addEventListener('keydown', event => { if (event.key === ' ') event.stopPropagation(); });
  $('podiumClose').onclick = close; $('podiumContinue').onclick = close;
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  $('podiumEvent').onchange = () => loadBoard();
  $('podiumRefresh').onclick = async () => { await loadBoard(true); await flush(); };
  $('driverEdit').onclick = () => nameForm(true);
  $('welcomeDriverInput')?.addEventListener('input', () => { rememberName(); nameNote(nameProblem || 'Remembered here. Shown on shared podiums.', !!nameProblem); });
  $('welcomeDriverInput')?.addEventListener('blur', () => { rememberName(); syncName(true); });
  $('driverSkip').onclick = () => { declinedName = true; close(); };
  $('driverForm').onsubmit = async event => {
    event.preventDefault(); $('nameError').textContent = ''; $('driverSave').disabled = true;
    draftName = $('driverInput').value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    try {
      nameProblem = nameError(draftName);
      if (nameProblem) { nameNote(nameProblem, true); updateDriver(); throw new ServiceError(nameProblem, 400); }
      save(NAME_KEY, draftName);
      if (!await ready(true)) throw new ServiceError('Podiums are temporarily unavailable. Your device best is saved.');
      await identity();
      const named = await request('/api/profile', { auth: true, data: { name: $('driverInput').value } });
      profile.name = named.name; draftName = named.name; save(NAME_KEY, draftName); nameProblem = '';
      const remembered = save(PROFILE_KEY, profile); declinedName = false; nameNote('Ready for the shared podiums.'); updateDriver(); nameForm(false);
      await loadBoard(); await flush();
      if (!remembered) status('Your name is remembered for this visit. Browser storage is unavailable.');
    } catch (error) { $('nameError').textContent = error.message; $('driverInput').focus(); }
    finally { $('driverSave').disabled = false; }
  };
  updateDriver();
  if (nameProblem) nameNote(nameProblem, true);
  addEventListener('online', () => { ready(true).then(() => { flush(); refreshHillLeader(); }); });
  refreshHillLeader();
  ready().then(() => flush());
})();
