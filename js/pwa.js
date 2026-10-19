import { createIcon } from './icons.js';

export function startPwa(store) {
  const slot = document.querySelector('#pwa-slot');
  if (!slot) return;
  const heading = document.createElement('h3');
  heading.textContent = 'Take your wheel with you';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Preparing offline access…';
  const install = document.createElement('button');
  install.type = 'button';
  install.className = 'btn btn--secondary';
  install.textContent = 'Install app';
  const instructions = document.createElement('p');
  instructions.hidden = true;
  instructions.textContent = 'On iPhone or iPad, open the Share menu and choose Add to Home Screen. On desktop or Android, look for Install app in your browser menu.';
  const privacy = document.createElement('p');
  privacy.textContent = 'Your wheel and journal stay in this browser on this device. They do not sync between devices. Download a backup before clearing browser data.';
  const update = document.createElement('button');
  update.type = 'button';
  update.className = 'btn btn--secondary';
  update.textContent = 'Reload for the new version';
  update.hidden = true;
  const updateNote = document.createElement('p');
  updateNote.hidden = true;
  updateNote.textContent = 'An update is ready. Save your check-in draft before reloading.';
  slot.replaceChildren(heading, status, install, instructions, privacy, updateNote, update);
  let installEvent = null;
  let applyUpdate = false;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  install.hidden = Boolean(standalone());
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
  });
  window.addEventListener('appinstalled', () => { install.hidden = true; instructions.hidden = true; });
  install.addEventListener('click', async () => {
    if (!installEvent) { instructions.hidden = !instructions.hidden; return; }
    const event = installEvent;
    installEvent = null;
    try { await event.prompt(); await event.userChoice; }
    catch { instructions.hidden = false; }
  });

  const favicon = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  const originalIcon = favicon?.getAttribute('href');
  let lastIcon = '';
  function setFavicon(state) {
    const current = state.current;
    const signature = JSON.stringify(current);
    if (!favicon || signature === lastIcon) return;
    lastIcon = signature;
    if (!current) { favicon.setAttribute('href', originalIcon); return; }
    const icon = createIcon(current.icon, 32);
    icon.setAttribute('color', current.color);
    icon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    icon.setAttribute('viewBox', '-5 -5 34 34');
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key, value] of Object.entries({x:-5, y:-5, width:34, height:34, rx:8, fill:'#040714', stroke:'none'})) background.setAttribute(key, value);
    icon.prepend(background);
    favicon.href = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(icon))}`;
  }
  setFavicon(store.getState());
  store.subscribe(setFavicon);

  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Offline installation needs HTTPS or localhost. Your journal still works here.';
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyUpdate) location.reload();
  });
  function readyStatus() {
    status.textContent = navigator.onLine ? 'Ready to use offline on this device.' : 'Offline. Your wheel and journal are available.';
  }
  navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).then(registration => {
    function waitingUpdate() {
      if (!registration.waiting) return;
      update.hidden = updateNote.hidden = false;
    }
    waitingUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') waitingUpdate();
        if (worker.state === 'redundant' && !registration.active) {
          status.textContent = 'Offline setup did not finish. Reconnect and reload to try again.';
        }
      });
    });
    update.addEventListener('click', () => {
      if (!registration.waiting) return;
      applyUpdate = true;
      registration.waiting.postMessage({type: 'APPLY_UPDATE'});
    });
    return navigator.serviceWorker.ready;
  }).then(() => {
    readyStatus();
    window.addEventListener('online', readyStatus);
    window.addEventListener('offline', readyStatus);
  }).catch(() => { status.textContent = 'Offline setup did not finish. Reconnect and reload to try again.'; });
}
