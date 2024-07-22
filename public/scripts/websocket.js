let ws = null;
let interval = null;

function openws() {
  if (ws) return;

  const url = window.location.protocol.replace('http', 'ws') +
    '//' + window.location.host + '/websocket';

  ws = new WebSocket(url);

  ws.onopen = () => {
    if (interval) {
      clearInterval(interval)
      interval = null
      console.log('reconnected')
    }
  }

  ws.onerror = error => {
    console.error(error);
    if (!interval) interval = setInterval(openws, 500);
  }

  ws.onclose = () => {
    if (!interval) interval = setInterval(openws, 5000);
  }

  ws.onmessage = async event => {
    // pause updates if user is recording
    let recording = document.querySelector(".record").style.backgroundColor !== ""

    if (!recording && event.data != document.body.dataset.timestamp) {
      let response = await fetch(window.location.href, { headers: { 'Accept': 'text/html' } });
      let newdoc = new DOMParser().parseFromString(await response.text(), 'text/html');
      document.body.replaceWith(newdoc.body);
    }
  }
};

document.addEventListener('DOMContentLoaded', openws);
