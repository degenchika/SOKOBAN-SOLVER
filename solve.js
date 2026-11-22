// A push-optimal Sokoban solver, written from scratch for this bounty.
//
// Design:
//  - Parse the XSB level, then split it into rooms: the hallway row's dead
//    squares (a box there can reach no goal) cut the floor, and each
//    remaining part holding a box is one room. Rooms are independent: a box
//    pushed out of a room into the hallway can never come back, so every
//    box stays in its room and the level's optimum is the sum of the rooms'.
//  - Each room is solved on its own with a breadth-first search over
//    pushes, so the first solved state met is push-optimal. A state is the
//    boxes' squares plus the player's reachable region (named by its
//    lowest square); two states with the same boxes and the same region
//    are one state. Dead squares (pull-reachability from the goals) and
//    frozen 2 x 2 blocks prune positions no push can save.
//  - The room solutions are joined by the player's walks through the
//    hallway, in a fixed room order. Only pushes are scored, so the walks
//    cost nothing; the push count is what the checker grades.
//  - Pure and deterministic: fixed iteration orders everywhere, no clock,
//    no randomness, work budgets counted in states, never in seconds.

const DIRS = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
];

/** Parse XSB text into width, walls, goals, boxes and the player square. */
function parseLevel(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals = [];
  const boxes = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  // The outermost frame is wall whatever it shows: nothing leaves the board.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

/**
 * The live squares: every square a box alone can be pushed from onto some
 * goal. Pulled back from the goals over open floor: from a live square x,
 * the square y one step back is live when the player could stand one step
 * further back to push from it. A box off a live square is dead.
 */
function liveSquares(w, wall, goals) {
  const live = new Uint8Array(wall.length);
  const queue = [...goals];
  for (const g of goals) live[g] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    for (let k = 0; k < 4; k++) {
      const d = k === 0 ? -w : k === 1 ? w : k === 2 ? -1 : 1;
      const y = x - d;
      if (!wall[y] && !wall[y - d] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/**
 * Flood-fill the player's reachable region from `from` around walls and
 * `occupied` boxes, stamping squares in `seen` with `stamp`; returns the
 * region's lowest square, the region's canonical name.
 */
function reachRegion(w, wall, occupied, from, seen, stamp, stack) {
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n];
    if (p < low) low = p;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - w : k === 1 ? p + w : k === 2 ? p - 1 : p + 1;
      if (wall[q] === 0 && occupied[q] === 0 && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

/**
 * Whether the box just pushed to `t` sits in a frozen 2 x 2 block: four
 * squares of walls and boxes holding a box off its goal. Such a box can
 * never move again, so the state is dead.
 */
function frozenBlock(w, wall, occupied, goal, t) {
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(wall[a] || occupied[a]) || !(wall[b] || occupied[b])) continue;
    if (!(wall[c] || occupied[c]) || !(wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[b] && !goal[b])) return true;
    if ((occupied[c] && !goal[c]) || (occupied[d] && !goal[d])) return true;
  }
  return false;
}

/** A state's key: the region's lowest square, then the boxes' squares. */
function keyOf(boxes, low, size) {
  let k = low;
  for (const b of boxes) k = k * size + b;
  return k;
}

/** The shortest walk from `from` to `to` around walls and boxes (lower LURD letters). */
function walkTo(w, wall, occupied, from, to) {
  if (from === to) return '';
  const prev = new Int32Array(wall.length).fill(-1);
  const how = new Array(wall.length);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === to) break;
    for (let k = 0; k < 4; k++) {
      const d = k === 0 ? -w : k === 1 ? w : k === 2 ? -1 : 1;
      const q = p + d;
      if (wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = DIRS[k][2];
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: the push square is out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]) s = how[p] + s;
  return s;
}

/**
 * Push-optimal solution of one room (or a whole level): {pushes, moves,
 * player} — the player square after the last move — or null when the
 * search gives up. Breadth-first over pushes: the first solved state met
 * is optimal. `maxStates` is a work budget, never a clock.
 */
function solvePushOptimal(w, wall, goals, boxes, player, maxStates) {
  const size = wall.length;
  const goal = new Uint8Array(size);
  for (const g of goals) goal[g] = 1;
  const live = liveSquares(w, wall, goals);
  const occupied = new Uint8Array(size);
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;
  const solved = (bs) => bs.every((b) => goal[b]);
  if (boxes.some((b) => !live[b])) return null;

  const statesBoxes = [boxes.slice()];
  const statesPlayer = [player];
  const parent = [-1];
  const pushFrom = [-1];
  const pushTo = [-1];
  const index = new Map();
  for (const b of boxes) occupied[b] = 1;
  index.set(keyOf(boxes, reachRegion(w, wall, occupied, player, seen, ++stamp, stack), size), 0);
  for (const b of boxes) occupied[b] = 0;

  let found = solved(boxes) ? 0 : -1;
  for (let head = 0; found < 0 && head < statesBoxes.length; head++) {
    const bs = statesBoxes[head];
    for (const b of bs) occupied[b] = 1;
    reachRegion(w, wall, occupied, statesPlayer[head], seen, ++stamp, stack);
    const here = stamp;
    for (let bi = 0; bi < bs.length && found < 0; bi++) {
      const b = bs[bi];
      for (let k = 0; k < 4; k++) {
        const d = k === 0 ? -w : k === 1 ? w : k === 2 ? -1 : 1;
        const t = b + d;
        // The player must stand on the square behind the box to push it.
        if (seen[b - d] !== here || wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        const frozen = frozenBlock(w, wall, occupied, goal, t);
        let key = -1;
        let next = null;
        if (!frozen) {
          next = bs.slice();
          next[bi] = t;
          next.sort((x, y) => x - y);
          key = keyOf(next, reachRegion(w, wall, occupied, b, mark, ++stamp, stack), size);
        }
        occupied[t] = 0;
        occupied[b] = 1;
        if (frozen || index.has(key)) continue;
        if (statesBoxes.length >= maxStates) {
          for (const x of bs) occupied[x] = 0;
          return null;
        }
        index.set(key, statesBoxes.length);
        statesBoxes.push(next);
        statesPlayer.push(b);
        parent.push(head);
        pushFrom.push(b);
        pushTo.push(t);
        if (solved(next)) {
          found = statesBoxes.length - 1;
          break;
        }
      }
    }
    for (const x of bs) occupied[x] = 0;
  }
  if (found < 0) return null;

  // The path of states, then the moves: walk to each push's square, then push.
  const path = [];
  for (let s = found; s > 0; s = parent[s]) path.push(s);
  path.reverse();
  let moves = '';
  let pl = player;
  let cur = boxes.slice();
  for (const s of path) {
    const nextBoxes = statesBoxes[s];
    const from = pushFrom[s];
    const to = pushTo[s];
    const d = to - from;
    const dir = DIRS[d === -w ? 0 : d === w ? 1 : d === -1 ? 2 : 3];
    for (const b of cur) occupied[b] = 1;
    moves += walkTo(w, wall, occupied, pl, from - d);
    for (const b of cur) occupied[b] = 0;
    moves += dir[3];
    pl = from;
    cur = nextBoxes;
  }
  return { pushes: path.length, moves, player: pl };
}

/**
 * The level's rooms: cut the dead squares of the player's row (the
 * hallway: a box there reaches no goal) out of the floor, and each part
 * left that holds a box is a room. Null when the level is no set of rooms.
 */
function roomsOf(level) {
  const { w, wall, goals, boxes, player } = level;
  const live = liveSquares(w, wall, goals);
  const row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length);
  for (let i = row * w; i < (row + 1) * w; i++) if (!wall[i] && !live[i]) cut[i] = 1;
  if (boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(wall.length).fill(-1);
  const rooms = [];
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (let k = 0; k < 4; k++) {
        const d = k === 0 ? -w : k === 1 ? w : k === 2 ? -1 : 1;
        const q = squares[i] + d;
        if (!wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0)) return null;
  if (rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/** The most states one room search keeps before it gives up: work, never the clock. */
const MAX_STATES = 250_000;

/**
 * Solve a whole level: room by room, the other rooms' boxes standing as
 * walls (on their goals once their room is done), the player walking on
 * from where the last room left it. Returns the moves string, or '' when
 * a room's search gives up (an empty answer is valid, worth no points).
 */
export function solveLevel(text) {
  const level = parseLevel(text);
  const { w, wall, goals, boxes } = level;
  const rooms = roomsOf(level);
  if (rooms === null) {
    const whole = solvePushOptimal(w, wall, goals, boxes, level.player, MAX_STATES);
    return whole === null ? '' : whole.moves;
  }
  let player = level.player;
  let moves = '';
  for (const room of rooms) {
    const subWall = wall.slice();
    for (const other of rooms) {
      if (other === room) continue;
      const at = other.done ? other.goals : other.boxes;
      for (const b of at) subWall[b] = 1;
    }
    const solved = solvePushOptimal(
      w,
      subWall,
      room.goals.slice().sort((a, b) => a - b),
      room.boxes.slice().sort((a, b) => a - b),
      player,
      MAX_STATES,
    );
    if (solved === null) return '';
    moves += solved.moves;
    player = solved.player;
    room.done = true;
  }
  return moves;
}
