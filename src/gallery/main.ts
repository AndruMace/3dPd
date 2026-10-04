// Dev-only page: every character sprite and item from the original game, voxelized and animated.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { SPRITES } from '../content/sprites';
import { VoxelSprite } from '../render/actors/VoxelSprite';
import { PIXEL, voxelGeometry } from '../render/voxel/geometry';
import { frameCount, frameRect, loadSheet } from '../render/voxel/sheets';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.style.position = 'fixed';
labels.domElement.style.top = '0';
labels.domElement.style.pointerEvents = 'none';
document.body.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15131a);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
camera.position.set(0, 9, 12);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xc8d0ff, 0x302820, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0x2a2630 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function label(text: string, height: number): CSS2DObject {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.set(0, height + 0.15, 0);
  return obj;
}

const sprites: VoxelSprite[] = [];
const ids = Object.keys(SPRITES).sort();
const cols = Math.ceil(Math.sqrt(ids.length));
const SPACING = 1.6;

await Promise.all(
  ids.map(async (id, i) => {
    const s = await VoxelSprite.create(id);
    s.position.set(((i % cols) - (cols - 1) / 2) * SPACING, 0, (Math.floor(i / cols) - cols / 2) * SPACING);
    s.add(label(id, s.def.frameHeight * PIXEL));
    s.play('idle');
    scene.add(s);
    sprites.push(s);
  }),
);

// Items: every non-empty 16x16 cell of items.png, laid out in a row band behind the characters.
const items = await loadSheet('items.png');
const itemMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const itemGroup = new THREE.Group();
const nItems = frameCount(items, 16, 16);
let placed = 0;
for (let i = 0; i < nItems; i++) {
  const geo = voxelGeometry('items.png', items, frameRect(items, 16, 16, i), { maxDepth: 3 });
  if (!geo.getIndex()?.count) continue;
  const m = new THREE.Mesh(geo, itemMat);
  m.castShadow = true;
  m.position.set((placed % 16) * 0.9 - 7, 0, -cols * SPACING * 0.5 - 2 - Math.floor(placed / 16) * 0.9);
  itemGroup.add(m);
  placed++;
}
scene.add(itemGroup);

// Controls
const panel = document.getElementById('panel')!;
const animNames = [...new Set(Object.values(SPRITES).flatMap((d) => Object.keys(d.animations)))];
const buttons: HTMLButtonElement[] = [];
for (const name of animNames) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => {
    for (const s of sprites) s.play(s.def.animations[name] ? name : 'idle', true);
    for (const o of buttons) o.classList.toggle('on', o === b);
  };
  if (name === 'idle') b.classList.add('on');
  buttons.push(b);
  panel.appendChild(b);
}
const toggle = (text: string, initial: boolean, apply: (on: boolean) => void) => {
  const l = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = initial;
  c.onchange = () => apply(c.checked);
  l.append(c, ` ${text}`);
  panel.appendChild(l);
};
toggle('face camera', true, (on) => sprites.forEach((s) => ((s.billboard = on), on || s.rotation.set(0, 0, 0))));
toggle('flip', false, (on) => sprites.forEach((s) => (s.flipped = on)));
toggle('items', true, (on) => (itemGroup.visible = on));

const tierLabel = document.createElement('label');
const tier = document.createElement('input');
tier.type = 'range';
tier.min = '0';
tier.max = '6';
tier.value = '0';
tier.oninput = () => {
  for (const s of sprites)
    if (s.def.rowsAreTiers) {
      s.tier = Number(tier.value);
      s.play(s.clip.anim ? Object.entries(s.def.animations).find(([, a]) => a === s.clip.anim)![0] : 'idle', true);
    }
};
tierLabel.append('armor tier ', tier);
panel.appendChild(tierLabel);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update();
  for (const s of sprites) s.update(dt, camera);
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
