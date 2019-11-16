class Input {
  constructor() {
    this.left = false;
    this.right = false;
  }
}

class Player {
  constructor(name, x) {
    this.input = new Input();
    this.name = name;
    this.x = x;
  }
}

const serverElement = document.getElementById('server');
const clientElement = document.getElementById('client');

const initState = {
  time: Date.now(),
  players: [new Player('Jeppe', 0), new Player('Juuso', 0)]
};

let clientEvents = [];
let immediateClientEvents = [];
let serverEvents = [];

const HISTORY_DURATION = 1000;
const DT = 16;
const LATENCY = 45;
const LATENCY_SWAY = 0.5;

const BUFFERED_STATES_COUNT = Math.floor(HISTORY_DURATION / DT);
let serverStateHistory = [...Array(BUFFERED_STATES_COUNT)].map(() => deepCopy(initState));
let clientStateHistory = [...Array(BUFFERED_STATES_COUNT)].map(() => deepCopy(initState));

const realLatency = () =>
  LATENCY * (1 - LATENCY_SWAY) + LATENCY * Math.random() * LATENCY_SWAY * 2;

function syncTime() {
  return Date.now() + LATENCY;
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

const first = arr => arr[0];
const last = arr => arr[arr.length - 1];
const ascendingBy = (arr, key) => arr.sort((a, b) => a[key] - b[key]);

const updatePlayer = events => player => {
  const playerEvents = events.filter(e => e.name === player.name);

  playerEvents.forEach(e => {
    switch (e.type) {
      case 'input.left':
        player.input.left = e.value;
        break;
      case 'input.right':
        player.input.right = e.value;
        break;
    }
  });

  if (player.input.left) player.x--;
  if (player.input.right) player.x++;
};

function replayEvents(stateHistory, events, now) {
  const eventIsCurant = e => now - e.time < HISTORY_DURATION;
  const curantEvents = events.filter(eventIsCurant);
  const oldestEvent = first(ascendingBy(curantEvents, 'time'));
  let newStateHistory = stateHistory;

  if (oldestEvent) {
    newStateHistory = stateHistory.filter(
      state => state.time < oldestEvent.time
    );

    const startState = last(newStateHistory);

    if (startState) {
      let state = startState;

      while (state.time < now) {
        const events = curantEvents.filter(
          e => e.time >= state.time && e.time < state.time + DT
        );
        state = update(state, events, DT);
        newStateHistory.push(state);
      }
    }
  }
  return newStateHistory;
}

function update(state, events, dt, time) {
  const newState = deepCopy(state);
  newState.time = time || newState.time + dt;
  newState.players.forEach(updatePlayer(events));
  return newState;
}

function emitToServer(events) {
  const eventsCopy = deepCopy(events);

  setTimeout(() => {
    // At server
    const now = Date.now();
    serverEvents.push(...eventsCopy);

    serverStateHistory = replayEvents(serverStateHistory, serverEvents, now);
    serverEvents = serverEvents.filter(
      e => Date.now() - e.time < HISTORY_DURATION
    );
  }, realLatency());
}

const syncedProps = [
  {
    selector: state => state.players.find(p => p.name === 'Jeppe'),
    keys: ['x'],
    rubberbandStrength: 0.01,
  }
];

const staticState = state => ({
  ...state,
  players: state.players.filter(p => p.name !== 'Jeppe'),
});



function emiteToClient(state) {
  const serverStateSnapshot = deepCopy(state);

  setTimeout(() => {
    //At client
    syncedProps.forEach(({ selector, keys, rubberbandStrength }) => {
      const currentLocalState = last(clientStateHistory);
      const localStateSnapshot = last(clientStateHistory.filter(({ time }) => time < serverStateSnapshot.time)) || currentLocalState;

      const currentObject = selector(currentLocalState);
      const localObjectSnapshot = selector(localStateSnapshot);
      const serverObjectSnapshot = selector(serverStateSnapshot);

      keys.forEach(key => {
        const localValue = localObjectSnapshot[key];
        const serverValue = serverObjectSnapshot[key];
        const diff = serverValue - localValue;
        currentObject[key] += diff * rubberbandStrength;
      })

    });
  }, realLatency());
}

setInterval(() => {
  //server
  const lastState = serverStateHistory[serverStateHistory.length - 1];
  serverStateHistory.push(update(lastState, [], DT, Date.now()));
  serverElement.innerHTML = JSON.stringify(lastState);
  serverElement.style.transform = `translate(${lastState.players.find(
    p => p.name === 'Jeppe'
  ).x * 10}px, 0)`;
  emiteToClient(lastState);
}, DT);

setInterval(() => {
  //client
  emitToServer(immediateClientEvents);
  const previousState = last(clientStateHistory);
  const newState = update(previousState, immediateClientEvents, DT, syncTime());
  clientStateHistory.push(newState);
  clientElement.innerHTML = JSON.stringify(newState);
  clientElement.style.transform = `translate(${newState.players.find(
    p => p.name === 'Jeppe'
  ).x * 10}px, 0)`;
  immediateClientEvents = [];
}, DT);

function dispatch(e) {
  const extendedEvent = { ...e, time: syncTime(), name: 'Jeppe' };
  clientEvents.push(extendedEvent);
  immediateClientEvents.push(extendedEvent);
}

setTimeout(() => {
  const extendedEvent = { type: 'input.right', value: true, time: syncTime(), name: 'Juuso' };
  emitToServer([extendedEvent]);
  setTimeout(() => {
    const extendedEvent = { type: 'input.right', value: false, time: syncTime(), name: 'Juuso' };
    emitToServer([extendedEvent]);
  }, 1000)
}, 500);

const keysDown = {};

window.addEventListener('keydown', e => {
  if (keysDown[e.key]) return;

  if (e.key === 'ArrowLeft') {
    dispatch({
      type: 'input.left',
      value: true
    });
  }
  if (e.key === 'ArrowRight') {
    dispatch({
      type: 'input.right',
      value: true
    });
  }
  keysDown[e.key] = true;
});

window.addEventListener('keyup', e => {
  keysDown[e.key] = false;
  if (e.key === 'ArrowLeft') {
    dispatch({
      type: 'input.left',
      value: false
    });
  }
  if (e.key === 'ArrowRight') {
    dispatch({
      type: 'input.right',
      value: false
    });
  }
});
