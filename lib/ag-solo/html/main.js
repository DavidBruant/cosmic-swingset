/* global WebSocket fetch document window */
const RECONNECT_BACKOFF_SECONDS = 3;
// Functions to run to reset the HTML state to what it was.
const resetFns = [];
let inpBackground;

function run() {
  const disableFns = []; // Functions to run when the input should be disabled.
  resetFns.push(() => (document.querySelector('#history').innerHTML = ''));

  let nextHistNum = 0;
  let inputHistoryNum = 0;
  const historyNumberElements = document.querySelectorAll('.historyNumber');

  async function call(req) {
    const res = await fetch('/vat', {
      method: 'POST',
      body: JSON.stringify(req),
      headers: { 'Content-Type': 'application/json' },
    });
    const j = await res.json();
    if (j.ok) {
      return j.res;
    }
    throw new Error(`server error: ${JSON.stringify(j.rej)}`);
  }

  const loc = window.location;
  const protocol = loc.protocol.replace(/^http/, 'ws');
  const socketEndpoint = `${protocol}//${loc.host}/`;
  const ws = new WebSocket(socketEndpoint);

  ws.addEventListener('error', ev => {
    console.log(`ws.error ${ev}`);
    ws.close();
  });

  ws.addEventListener('close', _ev => {
    for (const fn of disableFns) {
      fn();
    }
    console.log(`Reconnecting in ${RECONNECT_BACKOFF_SECONDS} seconds`);
    setTimeout(run, RECONNECT_BACKOFF_SECONDS * 1000);
  });

  const commands = [];
  function addEntry(histnum, command, display) {
    const c = document.createElement('div');
    const h = document.getElementById('history');
    const isScrolledToBottom = h.scrollHeight - h.clientHeight <= h.scrollTop + 1;
    c.setAttribute('id', `command-${histnum}`);
    c.setAttribute('class', 'command-line');
    c.appendChild(document.createTextNode(''));
    h.append(c);
    commands[histnum] = command;

    const d = document.createElement('div');
    d.setAttribute('id', `history-${histnum}`);
    d.setAttribute('class', 'history-line');
    d.appendChild(document.createTextNode(''));
    h.append(d);
    if (isScrolledToBottom) {
      setTimeout(() => (h.scrollTop = h.scrollHeight), 0);
    }
  }

  function updateHistory(histnum, command, display) {
    const h = document.getElementById('history');
    const isScrolledToBottom = h.scrollHeight - h.clientHeight <= h.scrollTop + 1;
    if (histnum >= nextHistNum) {
      nextHistNum = histnum + 1;
    }
    let c = document.getElementById(`command-${histnum}`);
    if (!c) {
      addEntry(histnum, command, display);
    }
    c = document.getElementById(`command-${histnum}`);
    const h1 = document.getElementById(`history-${histnum}`);
    c.textContent = `command[${histnum}] = ${command}`;
    h1.textContent = `history[${histnum}] = ${display}`;
    if (isScrolledToBottom) {
      setTimeout(() => (h.scrollTop = h.scrollHeight), 0);
    }
  }

  function setNextHistNum(max = 0) {
    const thisHistNum = nextHistNum;
    nextHistNum = Math.max(nextHistNum, max);
    for (const el of historyNumberElements) {
      el.textContent = nextHistNum;
    }
    inputHistoryNum = nextHistNum;
    commands[inputHistoryNum] = '';
    return thisHistNum;
  }

  const galleryNode = document.getElementById('galleryBoard');
  const PIXEL_SIZE = 50; // actual pixels per pixel

  galleryNode.addEventListener('mousemove', e => {
    const x = Math.floor(e.clientX / PIXEL_SIZE) - 1;
    const y = Math.floor(e.clientY / PIXEL_SIZE) - 1;
    galleryNode.setAttribute('title', `x:${x},y:${y}`);
  });

  console.log("GALLERY SETUP");

  function initCanvas(state) {
    // remove any existing pixel cells
    while (galleryNode.firstChild) {
      galleryNode.removeChild(galleryNode.firstChild);
    }
    for (let x = 0; x < state.length; x += 1) {
      for (let y = 0; y < state.length; y += 1) {
        const px = document.createElement('div');
        px.id = `pix${x}.${y}`;
        px.classList.add('pixel');
        px.style.backgroundColor = state[x][y];
        galleryNode.appendChild(px);
      }
    }
  }

  let oldState;
  function updateCanvas(state) {
    if (!oldState) {
      console.log(`initializing gallery: ${state}`);
      oldState = state;
      // gallery hasn't been initialized
      initCanvas(state);
      return;
    }
    console.log(state);
    function renderPixel(x, y, color) {
      const px = document.getElementById(`pix${x}.${y}`);
      // First set the color to transparent so that the background error image shows through
      // Then if the supplied color is bogus, the assigned it will fail
      // and the user will see the error image underneath
      px.style.backgroundColor = 'transparent';
      px.style.backgroundColor = color;
      oldState[x][y] = color;
      // Trigger the animation, by removing the .updated class if present, forcing a re-layout,
      // then adding the .updated class, which has the associated animation. The re-layout is
      // forced by asking for the offsetWidth of the element. This ensures that on
      // re-rendering after we return, that the animation will be triggered.
      px.classList.remove('updated');
      // the 'void' is required to force execution of the accessor
      void px.offsetWidth;
      px.classList.add('updated');
    }
    for (let x = 0; x < state.length; x += 1) {
      for (let y = 0; y < state.length; y += 1) {
        const newcolor = state[x][y];
        if (newcolor !== oldState[x][y]) {
          renderPixel(x, y, newcolor);
        }
      }
    }
  }

  function handleMessage(obj) {
    // we receive commands to update result boxes
    if (obj.type === 'updateHistory') {
      // these args come from calls to vat-http.js updateHistorySlot()
      updateHistory(obj.histnum, obj.command, obj.display);
    } else if (obj.type === 'updateCanvas') {
      updateCanvas(JSON.parse(obj.state));
    } else {
      console.log(`unknown WS type in:`, obj);
    }
  }

  // history updates (promises being resolved) and canvas updates
  // (pixels being colored) are delivered by websocket
  // broadcasts
  ws.addEventListener('message', ev => {
    try {
      // console.log('ws.message:', ev.data);
      const obj = JSON.parse(ev.data);
      handleMessage(obj);
    } catch (e) {
      console.log(`error handling message`, e);
    }
  });

  ws.addEventListener('open', _ev => {
    console.log(`ws.open!`);
    while (resetFns.length > 0) {
      const fn = resetFns.shift();
      try {
        fn();
      } catch (e) {
        console.error(`error resetting`, e);
      }
    }
    call({ type: 'getCanvasState' })
      .then(msg => {
        handleMessage(msg);
      })
      .then(_ =>
        call({ type: 'getHighestHistory' }).then(res => {
          // eslint-disable-next-line no-use-before-define
          setNextHistNum(res.highestHistory + 1);
          // console.log(`nextHistNum is now ${nextHistNum}`, res);
        }),
      )
      .then(_ => call({ type: 'rebroadcastHistory' }))
      .catch(_ => ws.close());
  });

  const inp = document.getElementById('input');

  function inputHistory(delta) {
    const nextInput = inputHistoryNum + delta;
    if (nextInput < 0 || nextInput >= commands.length) {
      // Do nothing.
      return;
    }
    inputHistoryNum = nextInput;
    inp.value = commands[inputHistoryNum];
  }

  function submitEval() {
    const command = inp.value;
    console.log('submitEval', command);
    const number = setNextHistNum(nextHistNum + 1);
    updateHistory(number, command, `sending for eval`);
    commands[commands.length - 1] = inp.value;
    commands[commands.length] = '';
    inp.value = '';
    call({ type: 'doEval', number, body: command });
  }

  function inputKeyup(ev) {
    switch (ev.key) {
      case 'Enter':
        submitEval();
        return false;

      case 'ArrowUp':
        inputHistory(-1);
        return false;

      case 'ArrowDown':
        inputHistory(+1);
        return false;

      case 'p':
        if (ev.ctrlKey) {
          inputHistory(-1);
          return false;
        }
        break;

      case 'n':
        if (ev.ctrlKey) {
          inputHistory(+1);
          return false;
        }
        break;

      // Do the standard behaviour.
      default:
    }
    commands[commands.length - 1] = inp.value;
    return true;
  }
  inp.addEventListener('keyup', inputKeyup);
  disableFns.push(() => inp.removeEventListener('keyup', inputKeyup));

  if (inpBackground === undefined) {
    inpBackground = inp.style.background;
  }
  disableFns.push(() => (inp.style.background = '#ff0000'));
  resetFns.push(() => (inp.style.background = inpBackground));

  document.getElementById('go').onclick = submitEval;
  disableFns.push(() =>
    document.getElementById('go').setAttribute('disabled', 'disabled'),
  );
  resetFns.push(() =>
    document.getElementById('go').removeAttribute('disabled'),
  );
}

run();
