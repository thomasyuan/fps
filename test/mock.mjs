// Minimal DOM + three.js mock so the game logic can be smoke-tested in Node.
function makeColor(v) { return { value: v, setHex(h) { this.value = h; return this; }, getHex() { return this.value; }, set() { return this; } }; }
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  setScalar(s) { return this.set(s, s, s); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
}
class Quaternion { copy() { return this; } set() { return this; } }
// row-major 3x3 rotation + translation, enough for localToWorld in tests
function ident() { return { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }; }
function matMul(A, B) {
  const r = new Array(9), a = A.r, b = B.r;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  const t = [
    a[0] * B.t[0] + a[1] * B.t[1] + a[2] * B.t[2] + A.t[0],
    a[3] * B.t[0] + a[4] * B.t[1] + a[5] * B.t[2] + A.t[1],
    a[6] * B.t[0] + a[7] * B.t[1] + a[8] * B.t[2] + A.t[2]
  ];
  return { r, t };
}
function eulerMat(e, sx, sy, sz) {
  const cX = Math.cos(e.x), sX = Math.sin(e.x), cY = Math.cos(e.y), sY = Math.sin(e.y), cZ = Math.cos(e.z), sZ = Math.sin(e.z);
  let R;
  if (e.order === 'YXZ') {
    R = [cY * cZ + sY * sX * sZ, -cY * sZ + sY * sX * cZ, sY * cX,
         cX * sZ, cX * cZ, -sX,
         -sY * cZ + cY * sX * sZ, sY * sZ + cY * sX * cZ, cY * cX];
  } else {
    R = [cY * cZ, -cY * sZ, sY,
         sX * sY * cZ + cX * sZ, -sX * sY * sZ + cX * cZ, -sX * cY,
         sX * sZ - cX * sY * cZ, sX * cZ + cX * sY * sZ, cX * cY];
  }
  return { r: [R[0] * sx, R[1] * sy, R[2] * sz, R[3] * sx, R[4] * sy, R[5] * sz, R[6] * sx, R[7] * sy, R[8] * sz], t: [0, 0, 0] };
}
class Obj3 {
  constructor() {
    this.children = []; this.position = new V3();
    this.rotation = { x: 0, y: 0, z: 0, order: 'XYZ', set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
    this.scale = new V3(1, 1, 1); this.quaternion = new Quaternion(); this.userData = {};
    this.visible = true; this.castShadow = false; this.receiveShadow = false; this.frustumCulled = true;
    this.matrix = ident(); this.matrixWorld = ident(); this.parent = null;
  }
  add(c) { this.children.push(c); c.parent = this; return this; }
  remove(c) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parent = null; } return this; }
  clear() { for (const c of this.children) c.parent = null; this.children.length = 0; return this; }
  lookAt() { return this; }
  updateMatrixWorld(force) {
    this.matrix = matMul(eulerMat(this.rotation, this.scale.x, this.scale.y, this.scale.z), ident());
    this.matrix.t = [this.position.x, this.position.y, this.position.z];
    this.matrixWorld = this.parent ? matMul(this.parent.matrixWorld, this.matrix) : this.matrix;
    for (const c of this.children) c.updateMatrixWorld(force);
    return this;
  }
  localToWorld(v) {
    const m = this.matrixWorld;
    return v.set(m.r[0] * v.x + m.r[1] * v.y + m.r[2] * v.z + m.t[0],
                 m.r[3] * v.x + m.r[4] * v.y + m.r[5] * v.z + m.t[1],
                 m.r[6] * v.x + m.r[7] * v.y + m.r[8] * v.z + m.t[2]);
  }
}
class Group extends Obj3 {}
class Mat {
  constructor(p = {}) {
    Object.assign(this, p);
    this.color = makeColor(p.color === undefined ? 0xffffff : p.color);
    this.emissive = makeColor(p.emissive || 0);
    if (this.emissiveIntensity === undefined) this.emissiveIntensity = 1;
    if (this.opacity === undefined) this.opacity = 1;
  }
  dispose() {}
  clone() { const c = new Mat({}); Object.assign(c, this); c.color = makeColor(this.color.value); c.emissive = makeColor(this.emissive.value); return c; }
}
class Geo { constructor(...a) { this.args = a; this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } dispose() {} }
class Mesh extends Obj3 { constructor(g, m) { super(); this.isMesh = true; this.geometry = g; this.material = m; } }
class Points extends Obj3 { constructor(g, m) { super(); this.isPoints = true; this.geometry = g; this.material = m; } }
class Light extends Obj3 { constructor(c, i, d, dec) { super(); this.color = c; this.intensity = i; this.distance = d; this.decay = dec; this.shadow = { mapSize: { set() {} }, camera: {}, bias: 0 }; } dispose() {} }
class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } }
class BufferGeometry { constructor() { this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } }

export const THREE = {
  Vector3: V3, Group, Mesh, Points,
  Scene: class Scene extends Obj3 { },
  Color: class Color { constructor(v) { this.value = v; } setHex(h) { this.value = h; return this; } getHex() { return this.value; } set() { return this; } },
  Fog: class Fog { constructor(c, n, f) { this.color = c; this.near = n; this.far = f; } },
  BoxGeometry: Geo, PlaneGeometry: Geo, SphereGeometry: Geo, CapsuleGeometry: Geo, CircleGeometry: Geo,
  CylinderGeometry: Geo,
  BufferGeometry, BufferAttribute,
  MeshStandardMaterial: Mat, MeshBasicMaterial: Mat, PointsMaterial: Mat,
  PointLight: Light, DirectionalLight: Light, HemisphereLight: Light,
  PerspectiveCamera: class PerspectiveCamera extends Obj3 {
    constructor(fov, aspect, near, far) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; }
    updateProjectionMatrix() {}
  },
  CanvasTexture: class CanvasTexture { constructor(c) { this.image = c; this.repeat = { set() {} }; this.colorSpace = ''; } },
  WebGLRenderer: class WebGLRenderer {
    constructor() { this.shadowMap = { enabled: false, type: 0 }; this.domElement = { style: {} }; this.outputColorSpace = ''; }
    setPixelRatio() {} setSize() {} render() {}
  },
  SRGBColorSpace: 'srgb'
};

function makeCtx() {
  return new Proxy({}, { get: (t, k) => { if (k === 'canvas') return {}; if (!(k in t)) t[k] = (k === 'fillStyle' || k === 'strokeStyle' || k === 'lineWidth') ? '' : () => {}; return t[k]; } });
}
export function makeDom() {
  const els = {};
  function el(tag, id) {
    return {
      tag, id, style: {}, children: [], textContent: '', innerHTML: '', width: 0, height: 0, handlers: {},
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { if (v === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (v) this._s.add(c); else this._s.delete(c); },
        contains(c) { return this._s.has(c); }
      },
      appendChild(c) { this.children.push(c); return c; },
      prepend(c) { this.children.unshift(c); },
      removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
      remove() {},
      addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); },
      requestPointerLock() { return Promise.resolve(); },
      getContext() { return makeCtx(); },
      get lastChild() { return this.children[this.children.length - 1]; }
    };
  }
  const doc = {
    hidden: false, pointerLockElement: null, handlers: {},
    getElementById(id) { return els[id] || (els[id] = el('div', id)); },
    createElement(tag) { return el(tag); },
    addEventListener(t, fn) { (doc.handlers[t] = doc.handlers[t] || []).push(fn); },
    exitPointerLock() { doc.pointerLockElement = null; }
  };
  return { doc, els };
}
export function makeAudio() {
  const node = () => ({ connect() {}, disconnect() {} });
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  return class AudioContextMock {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.destination = node(); }
    resume() {}
    createGain() { return Object.assign(node(), { gain: param() }); }
    createDynamicsCompressor() { return node(); }
    createStereoPanner() { return Object.assign(node(), { pan: param() }); }
    createBiquadFilter() { return Object.assign(node(), { type: 'lowpass', frequency: param(), Q: param() }); }
    createOscillator() { return Object.assign(node(), { type: 'sine', frequency: param(), start() {}, stop() {} }); }
    createBufferSource() { return Object.assign(node(), { buffer: null, playbackRate: param(), start() {}, stop() {} }); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  };
}
