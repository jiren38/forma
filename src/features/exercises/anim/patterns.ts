/**
 * Libreria dei movimenti animati. Ogni esercizio della libreria punta a uno di questi pattern.
 * Coordinate: viewBox 200x200, pavimento a y=180, la figura guarda verso destra (+x).
 */
import type { Keyframe, Pattern, Vec, Limb, PropAttach, SceneItem } from './skeleton';

const A = 173; // quota caviglia in appoggio
const STAND_HIP: Vec = [100, 96];
const standLeg: Limb = { ik: [102, A] };

/** Corpo rigido inclinato di theta gradi sopra l'orizzontale, testa verso -x (plank, push-up, rematore inverso). */
function plank(ankle: Vec, theta: number): Pick<Keyframe, 'hip' | 'torso' | 'leg'> {
  const r = (theta * Math.PI) / 180;
  return {
    hip: [ankle[0] - 78 * Math.cos(r), ankle[1] - 78 * Math.sin(r)],
    torso: theta - 90,
    leg: { a: [90 - theta, 90 - theta] },
  };
}
function shoulderOf(hip: Vec, torso: number, len = 52): Vec {
  const r = (torso * Math.PI) / 180;
  return [hip[0] + Math.sin(r) * len, hip[1] - Math.cos(r) * len];
}

const P = (
  id: string, label: string, keys: Keyframe[],
  o: Partial<Omit<Pattern, 'id' | 'label' | 'keys'>> = {},
): Pattern => ({ id, label, keys, view: o.view ?? 'side', duration: o.duration ?? 2.8, loop: o.loop ?? 'pingpong', props: o.props, scene: o.scene, phases: o.phases ?? [{ t: 0, label: 'Posizione iniziale' }, { t: 0.5, label: 'Fase di massima contrazione' }] });

const bar = (at: PropAttach['at'] = 'hand', dx = 0, dy = 0): PropAttach[] => [{ kind: 'barbell', at, dx, dy }];
const dbs: PropAttach[] = [{ kind: 'dumbbell', at: 'hand' }, { kind: 'dumbbell', at: 'hand2' }];
const BENCH: SceneItem = { type: 'bench', x: 36, y: 121, w: 104 };

// ---------------- Arti inferiori ----------------
const squatBB = P('squat_bb', 'Squat con bilanciere', [
  { t: 0, hip: [100, 95], torso: 8, arm: { rel: [-9, 7], bend: 'down' }, leg: { ik: [103, A] } },
  { t: 1, hip: [80, 140], torso: 42, arm: { rel: [-9, 7], bend: 'down' }, leg: { ik: [103, A] } },
], { props: bar('shoulder', -6, 2), phases: [{ t: 0, label: 'In piedi, bilanciere sui trapezi' }, { t: 0.5, label: 'Discesa: anche indietro, ginocchia in linea con le punte' }] });

const squatFront = P('squat_front', 'Front squat', [
  { t: 0, hip: [100, 95], torso: 4, arm: { rel: [13, 2], bend: 'fwd' }, leg: { ik: [103, A] } },
  { t: 1, hip: [85, 141], torso: 24, arm: { rel: [13, 2], bend: 'fwd' }, leg: { ik: [103, A] } },
], { props: bar('shoulder', 10, -2) });

const squatGoblet = P('squat_goblet', 'Goblet squat', [
  { t: 0, hip: [100, 95], torso: 5, arm: { rel: [12, 18], bend: 'down' }, leg: { ik: [103, A] } },
  { t: 1, hip: [84, 141], torso: 26, arm: { rel: [12, 18], bend: 'down' }, leg: { ik: [103, A] } },
], { props: [{ kind: 'dumbbell', at: 'hand', dy: -4 }] });

const squatBW = P('squat_bw', 'Squat a corpo libero', [
  { t: 0, hip: [100, 95], torso: 4, arm: { a: [10, 10] }, leg: { ik: [103, A] } },
  { t: 1, hip: [80, 140], torso: 36, arm: { a: [95, 95] }, leg: { ik: [103, A] } },
]);

const wallSit = P('wall_sit', 'Wall sit (isometria)', [
  { t: 0, hip: [70, 133], torso: -2, arm: { a: [10, 10] }, leg: { ik: [110, A] } },
  { t: 1, hip: [70, 134], torso: -2, arm: { a: [10, 10] }, leg: { ik: [110, A] } },
], { scene: [{ type: 'wall', x: 54, y: 20, h: 160 }], duration: 3, phases: [{ t: 0, label: 'Tieni la posizione: cosce parallele al pavimento' }] });

const deadlift = P('deadlift', 'Stacco da terra', [
  { t: 0, hip: [80, 128], torso: 58, arm: { ik: [116, 156] }, leg: { ik: [104, A] } },
  { t: 1, hip: [100, 96], torso: 0, arm: { ik: [103, 99] }, leg: { ik: [103, A] } },
], { props: bar('hand'), phases: [{ t: 0, label: 'Setup: schiena neutra, bilanciere sopra il mezzo piede' }, { t: 0.5, label: 'Lockout: anche e ginocchia estese' }] });

const rdl = P('rdl', 'Stacco rumeno', [
  { t: 0, hip: [100, 96], torso: 0, arm: { ik: [103, 99] }, leg: { ik: [103, A] } },
  { t: 1, hip: [76, 104], torso: 74, arm: { ik: [124, 140] }, leg: { ik: [102, A] } },
], { props: bar('hand') });

const goodMorning = P('good_morning', 'Good morning', [
  { t: 0, hip: [100, 96], torso: 4, arm: { rel: [-9, 7], bend: 'down' }, leg: { ik: [103, A] } },
  { t: 1, hip: [80, 102], torso: 72, arm: { rel: [-6, 9], bend: 'down' }, leg: { ik: [102, A] } },
], { props: bar('shoulder', -2, -4) });

const hipThrust = P('hip_thrust', 'Hip thrust', [
  { t: 0, hip: [110, 150], torso: -45, head: 20, arm: { ik: [112, 140] }, leg: { ik: [146, A], bend: 'up' } },
  { t: 1, hip: [122, 112], torso: -88, head: 30, arm: { ik: [122, 102] }, leg: { ik: [146, A], bend: 'up' } },
], { props: bar('hip', 0, -12), scene: [{ type: 'bench', x: 20, y: 122, w: 62 }] });

const gluteBridge = P('glute_bridge', 'Ponte glutei', [
  { t: 0, hip: [112, 166], torso: -90, arm: { a: [90, 90] }, leg: { ik: [148, A], bend: 'up' } },
  { t: 1, hip: [110, 138], torso: -119, arm: { a: [72, 72] }, leg: { ik: [148, A], bend: 'up' } },
], { scene: [{ type: 'mat', x: 20, y: 176, w: 160 }] });

const lunge = P('lunge', 'Affondo', [
  { t: 0, hip: [96, 100], torso: 2, arm: { a: [0, 0] }, leg: { ik: [128, A] }, leg2: { ik: [64, 168] }, foot2: 60 },
  { t: 1, hip: [95, 136], torso: 4, arm: { a: [0, 0] }, leg: { ik: [128, A] }, leg2: { ik: [64, 168] }, foot2: 60 },
], { props: dbs });

const bulgarian = P('bulgarian', 'Bulgarian split squat', [
  { t: 0, hip: [96, 103], torso: 6, arm: { a: [0, 0] }, leg: { ik: [120, A] }, leg2: { ik: [52, 124] }, foot2: 170 },
  { t: 1, hip: [92, 134], torso: 14, arm: { a: [0, 0] }, leg: { ik: [120, A] }, leg2: { ik: [52, 124] }, foot2: 170 },
], { props: dbs, scene: [{ type: 'bench', x: 14, y: 130, w: 48 }] });

const stepUp = P('step_up', 'Step-up', [
  { t: 0, hip: [96, 101], torso: 12, arm: { a: [0, 0] }, leg: { ik: [124, 133] }, leg2: { ik: [86, A] } },
  { t: 1, hip: [118, 58], torso: 0, arm: { a: [0, 0] }, leg: { ik: [122, 133] }, leg2: { ik: [140, 104] } },
], { props: dbs, scene: [{ type: 'box', x: 108, y: 140, w: 52, h: 40 }] });

const legPress = P('leg_press', 'Leg press', [
  { t: 0, hip: [70, 134], torso: -58, arm: { a: [25, 70] }, leg: { ik: [102, 98], bend: 'up' }, foot: -135 },
  { t: 1, hip: [70, 134], torso: -58, arm: { a: [25, 70] }, leg: { ik: [122, 80], bend: 'up' }, foot: -135 },
], { scene: [{ type: 'incline', x: 22, y: 146, w: 70, angle: -32 }, { type: 'machine', x: 0, y: 0, to: 'ankle' }], phases: [{ t: 0, label: 'Ginocchia flesse verso il petto' }, { t: 0.5, label: 'Spinta: gambe quasi distese, senza bloccare' }] });

const legExtension = P('leg_extension', 'Leg extension', [
  { t: 0, hip: [86, 132], torso: -6, arm: { a: [10, 40] }, leg: { a: [90, 4] } },
  { t: 1, hip: [86, 132], torso: -6, arm: { a: [10, 40] }, leg: { a: [90, 86] } },
], { scene: [{ type: 'seat', x: 62, y: 141, w: 70 }, { type: 'pad', x: 0, y: 0, to: 'ankle' }] });

const legCurl = P('leg_curl', 'Leg curl', [
  { t: 0, hip: [104, 112], torso: -90, head: 10, arm: { a: [-30, -10] }, leg: { a: [92, 92] } },
  { t: 1, hip: [104, 112], torso: -90, head: 10, arm: { a: [-30, -10] }, leg: { a: [92, 200] } },
], { scene: [{ type: 'bench', x: 30, y: 121, w: 112 }, { type: 'pad', x: 0, y: 0, to: 'ankle' }] });

const calfRaise = P('calf_raise', 'Calf raise', [
  { t: 0, hip: [100, 96], torso: 0, arm: { a: [0, 0] }, leg: { ik: [102, A] }, foot: 0 },
  { t: 1, hip: [100, 87], torso: 0, arm: { a: [0, 0] }, leg: { ik: [102, 164] }, foot: 44 },
], { props: dbs, duration: 2 });

const seatedCalf = P('seated_calf', 'Calf raise da seduto', [
  { t: 0, hip: [88, 132], torso: 0, arm: { ik: [124, 128] }, leg: { a: [90, 0] }, foot: 0 },
  { t: 1, hip: [88, 124], torso: 0, arm: { ik: [124, 120] }, leg: { a: [90, 0] }, foot: 40 },
], { scene: [{ type: 'seat', x: 62, y: 141, w: 52 }], duration: 2 });

const hipAbduction = P('hip_abduction', 'Abduzione anca', [
  { t: 0, hip: [100, 96], torso: 0, arm: { a: [12, 12] }, leg: { a: [2, 2] }, leg2: { a: [-2, -2] } },
  { t: 1, hip: [100, 97], torso: -3, arm: { a: [12, 12] }, leg: { a: [34, 34] }, leg2: { a: [-2, -2] } },
], { view: 'front' });

const sideLunge = P('side_lunge', 'Affondo laterale', [
  { t: 0, hip: [100, 104], torso: 0, arm: { a: [10, 10] }, leg: { ik: [140, A] }, leg2: { ik: [60, A] } },
  { t: 1, hip: [128, 128], torso: 0, arm: { a: [40, 40] }, leg: { ik: [140, A], bend: 'fwd' }, leg2: { ik: [60, A], bend: 'back' } },
], { view: 'front' });

const kbSwing = P('kb_swing', 'Kettlebell swing', [
  { t: 0, hip: [80, 108], torso: 64, arm: { ik: [96, 142] }, leg: { ik: [104, A] } },
  { t: 1, hip: [100, 95], torso: -3, arm: { a: [88, 88] }, leg: { ik: [103, A] } },
], { props: [{ kind: 'kettlebell', at: 'hand' }], duration: 1.8 });

const boxJump = P('box_jump', 'Box jump', [
  { t: 0, hip: [70, 96], torso: 0, arm: { a: [0, 0] }, leg: { ik: [72, A] } },
  { t: 0.22, hip: [56, 132], torso: 40, arm: { a: [-50, -40] }, leg: { ik: [74, A] } },
  { t: 0.45, hip: [92, 62], torso: 10, arm: { a: [150, 160] }, leg: { ik: [110, 120] } },
  { t: 0.65, hip: [118, 98], torso: 34, arm: { a: [80, 90] }, leg: { ik: [138, 133] } },
  { t: 1, hip: [134, 56], torso: 0, arm: { a: [0, 0] }, leg: { ik: [136, 133] } },
], { loop: 'cycle', duration: 2.6, scene: [{ type: 'box', x: 112, y: 140, w: 56, h: 40 }], phases: [{ t: 0, label: 'Carica' }, { t: 0.4, label: 'Salto esplosivo' }, { t: 0.7, label: 'Atterraggio morbido' }] });

const jumpSquat = P('jump_squat', 'Jump squat', [
  { t: 0, hip: [82, 138], torso: 36, arm: { a: [-30, -20] }, leg: { ik: [103, A] } },
  { t: 0.6, hip: [100, 92], torso: 2, arm: { a: [160, 170] }, leg: { ik: [102, A] } },
  { t: 1, hip: [100, 78], torso: 0, arm: { a: [170, 175] }, leg: { ik: [102, 158] }, foot: 40 },
], { duration: 1.6 });

const thruster = P('thruster', 'Thruster', [
  { t: 0, hip: [100, 95], torso: 4, arm: { rel: [13, 2], bend: 'fwd' }, leg: { ik: [103, A] } },
  { t: 0.4, hip: [85, 140], torso: 22, arm: { rel: [13, 2], bend: 'fwd' }, leg: { ik: [103, A] } },
  { t: 0.7, hip: [100, 95], torso: 2, arm: { rel: [6, -20], bend: 'fwd' }, leg: { ik: [103, A] } },
  { t: 1, hip: [100, 95], torso: 0, arm: { rel: [2, -53], bend: 'fwd' }, leg: { ik: [103, A] } },
], { props: bar('hand'), loop: 'cycle', duration: 2.6 });

// ---------------- Spinta (petto, spalle, tricipiti) ----------------
const lyingLegs: Limb = { ik: [154, A], bend: 'up' };
const benchPress = P('bench_press', 'Panca piana', [
  { t: 0, hip: [124, 112], torso: -90, arm: { ik: [76, 60], bend: 'down' }, leg: lyingLegs },
  { t: 1, hip: [124, 112], torso: -90, arm: { ik: [84, 96], bend: 'down' }, leg: lyingLegs },
], { props: bar('hand'), scene: [BENCH, { type: 'rack', x: 62, y: 40, h: 140 }], phases: [{ t: 0, label: 'Braccia distese sopra le spalle' }, { t: 0.5, label: 'Bilanciere al petto, gomiti a ~45°' }] });

const dbBench = P('db_bench', 'Distensioni con manubri', [
  { t: 0, hip: [124, 112], torso: -90, arm: { ik: [74, 62], bend: 'down' }, leg: lyingLegs },
  { t: 1, hip: [124, 112], torso: -90, arm: { ik: [76, 100], bend: 'down' }, leg: lyingLegs },
], { props: dbs, scene: [BENCH] });

const inclineHip: Vec = [112, 128];
const inclineLegs: Limb = { ik: [154, A], bend: 'up' };
const inclinePress = P('incline_press', 'Distensioni su panca inclinata', [
  { t: 0, hip: inclineHip, torso: -48, arm: { ik: [80, 42], bend: 'down' }, leg: inclineLegs },
  { t: 1, hip: inclineHip, torso: -48, arm: { ik: [86, 86], bend: 'down' }, leg: inclineLegs },
], { props: bar('hand'), scene: [{ type: 'incline', x: 70, y: 136, w: 66, angle: -42 }, { type: 'seat', x: 96, y: 137, w: 36 }] });

const dbFly = P('db_fly', 'Croci con manubri', [
  { t: 0, hip: [124, 112], torso: -90, arm: { a: [178, 182] }, leg: lyingLegs },
  { t: 1, hip: [124, 112], torso: -90, arm: { a: [100, 118] }, leg: lyingLegs },
], { props: dbs, scene: [BENCH] });

const pushUpTop = plank([176, 167], 20);
const pushUpBot = plank([176, 167], 5);
const pushUp = P('push_up', 'Piegamenti (push-up)', [
  { t: 0, ...pushUpTop, arm: { ik: [56, 177], bend: 'up' }, foot: 80 },
  { t: 1, ...pushUpBot, arm: { ik: [56, 177], bend: 'up' }, foot: 80 },
], { phases: [{ t: 0, label: 'Plank alto, corpo in linea' }, { t: 0.5, label: 'Petto vicino al suolo, gomiti a ~45°' }] });

const plankK = plank([176, 167], 12);
const plankPose = P('plank', 'Plank', [
  { t: 0, ...plankK, arm: { a: [0, -90] }, foot: 80 },
  { t: 1, ...plank([176, 167], 13), arm: { a: [0, -90] }, foot: 80 },
], { duration: 3.4, phases: [{ t: 0, label: 'Tieni la posizione: addome contratto, bacino neutro' }] });

const dipTop: Vec = [100, 54];
const dip = P('dip', 'Dip alle parallele', [
  { t: 0, hip: [dipTop[0] - 13, dipTop[1] + 50], torso: 15, arm: { ik: [102, 108], bend: 'back' }, leg: { a: [12, -70] } },
  { t: 1, hip: [84, 133], torso: 22, arm: { ik: [102, 108], bend: 'back' }, leg: { a: [12, -70] } },
], { scene: [{ type: 'bar', x: 102, y: 110, w: 30 }] });

const benchDip = P('bench_dip', 'Dip su panca', [
  { t: 0, hip: [92, 120], torso: -4, arm: { ik: [76, 121], bend: 'back' }, leg: { ik: [168, A], bend: 'up' } },
  { t: 1, hip: [94, 150], torso: -4, arm: { ik: [76, 121], bend: 'back' }, leg: { ik: [168, A], bend: 'up' } },
], { scene: [{ type: 'bench', x: 30, y: 124, w: 52 }] });

const ohp = P('ohp', 'Military press', [
  { t: 0, hip: STAND_HIP, torso: 0, head: -8, arm: { rel: [9, 0], bend: 'down' }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { rel: [3, -53], bend: 'fwd' }, leg: standLeg },
], { props: bar('hand') });

const seatedPress = P('seated_press', 'Shoulder press da seduto', [
  { t: 0, hip: [96, 136], torso: -3, arm: { rel: [4, -6], bend: 'down' }, leg: { ik: [138, A], bend: 'up' } },
  { t: 1, hip: [96, 136], torso: -3, arm: { rel: [2, -53], bend: 'fwd' }, leg: { ik: [138, A], bend: 'up' } },
], { props: dbs, scene: [{ type: 'seat', x: 70, y: 145, w: 46 }, { type: 'pad', x: 82, y: 86, h: 56 }] });

const lateralRaise = P('lateral_raise', 'Alzate laterali', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { a: [10, 12] }, leg: { a: [3, 3] } },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { a: [86, 92] }, leg: { a: [3, 3] } },
], { view: 'front', props: dbs });

const frontRaise = P('front_raise', 'Alzate frontali', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { a: [4, 6] }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { a: [90, 92] }, leg: standLeg },
], { props: [{ kind: 'dumbbell', at: 'hand' }] });

const chestPress = P('chest_press', 'Chest press', [
  { t: 0, hip: [86, 138], torso: -8, arm: { rel: [8, 6], bend: 'back' }, leg: { ik: [128, A], bend: 'up' } },
  { t: 1, hip: [86, 138], torso: -8, arm: { rel: [53, 4], bend: 'down' }, leg: { ik: [128, A], bend: 'up' } },
], { props: [{ kind: 'handle', at: 'hand' }], scene: [{ type: 'seat', x: 62, y: 147, w: 50 }, { type: 'pad', x: 70, y: 80, h: 62 }] });

const pecDeck = P('pec_deck', 'Pec deck', [
  { t: 0, hip: [86, 138], torso: -4, arm: { rel: [-22, -2], bend: 'down' }, leg: { ik: [128, A], bend: 'up' } },
  { t: 1, hip: [86, 138], torso: -4, arm: { rel: [40, -2], bend: 'down' }, leg: { ik: [128, A], bend: 'up' } },
], { props: [{ kind: 'handle', at: 'hand' }], scene: [{ type: 'seat', x: 62, y: 147, w: 50 }, { type: 'pad', x: 72, y: 80, h: 62 }] });

const cableFly = P('cable_fly', 'Croci ai cavi', [
  { t: 0, hip: STAND_HIP, torso: 14, arm: { a: [-60, -40] }, leg: { ik: [110, A] }, leg2: { ik: [86, A] } },
  { t: 1, hip: STAND_HIP, torso: 14, arm: { a: [60, 70] }, leg: { ik: [110, A] }, leg2: { ik: [86, A] } },
], { props: [{ kind: 'handle', at: 'hand' }], scene: [{ type: 'cable', x: 30, y: 30, to: 'hand' }] });

const pushdown = P('pushdown', 'Push-down ai cavi', [
  { t: 0, hip: STAND_HIP, torso: 10, arm: { a: [8, 150] }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 10, arm: { a: [8, 8] }, leg: standLeg },
], { props: [{ kind: 'handle', at: 'hand' }], scene: [{ type: 'cable', x: 126, y: 16, to: 'hand' }] });

const ohExt = P('oh_triceps', 'Estensioni sopra la testa', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { a: [172, -20] }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { a: [172, 176] }, leg: standLeg },
], { props: [{ kind: 'dumbbell', at: 'hand' }] });

const skull = P('skull_crusher', 'French press (skull crusher)', [
  { t: 0, hip: [124, 112], torso: -90, arm: { a: [190, 182] }, leg: lyingLegs },
  { t: 1, hip: [124, 112], torso: -90, arm: { a: [196, 300] }, leg: lyingLegs },
], { props: [{ kind: 'ezbar', at: 'hand' }], scene: [BENCH] });

const kickback = P('kickback', 'Kickback', [
  { t: 0, hip: [82, 104], torso: 68, arm: { a: [-100, 0] }, leg: { ik: [104, A] } },
  { t: 1, hip: [82, 104], torso: 68, arm: { a: [-104, -100] }, leg: { ik: [104, A] } },
], { props: [{ kind: 'dumbbell', at: 'hand' }] });

// ---------------- Trazione (schiena, bicipiti) ----------------
const pullBot: Vec = [93, 118];
const pullup = P('pullup', 'Trazioni alla sbarra', [
  { t: 0, hip: pullBot, torso: 5, arm: { ik: [100, 13], bend: 'fwd' }, leg: { a: [20, -55] } },
  { t: 1, hip: [92, 84], torso: 8, arm: { ik: [100, 13], bend: 'fwd' }, leg: { a: [22, -50] } },
], { scene: [{ type: 'bar', x: 100, y: 12, w: 8 }], phases: [{ t: 0, label: 'Sospensione a braccia distese' }, { t: 0.5, label: 'Mento sopra la sbarra, scapole addotte' }] });

const latPulldown = P('lat_pulldown', 'Lat machine', [
  { t: 0, hip: [96, 140], torso: -12, arm: { ik: [104, 38], bend: 'fwd' }, leg: { a: [88, 2] } },
  { t: 1, hip: [96, 140], torso: -16, arm: { ik: [100, 84], bend: 'down' }, leg: { a: [88, 2] } },
], { props: [{ kind: 'handle', at: 'hand' }], scene: [{ type: 'seat', x: 70, y: 149, w: 46 }, { type: 'cable', x: 104, y: 6, to: 'hand' }, { type: 'pad', x: 136, y: 128, w: 10, h: 8 }] });

const seatedRow = P('seated_row', 'Pulley basso', [
  { t: 0, hip: [70, 150], torso: 14, arm: { ik: [124, 132], bend: 'down' }, leg: { ik: [138, 166], bend: 'up' } },
  { t: 1, hip: [70, 150], torso: -8, arm: { ik: [84, 126], bend: 'back' }, leg: { ik: [138, 166], bend: 'up' } },
], { props: [{ kind: 'handle', at: 'hand' }], scene: [{ type: 'seat', x: 40, y: 159, w: 60 }, { type: 'cable', x: 186, y: 150, to: 'hand' }] });

const bentRow = P('bent_row', 'Rematore con bilanciere', [
  { t: 0, hip: [78, 102], torso: 70, arm: { ik: [126, 138], bend: 'up' }, leg: { ik: [101, A] } },
  { t: 1, hip: [78, 102], torso: 70, arm: { ik: [104, 116], bend: 'up' }, leg: { ik: [101, A] } },
], { props: bar('hand') });

const oneArmRow = P('one_arm_row', 'Rematore con manubrio', [
  { t: 0, hip: [70, 102], torso: 82, arm: { ik: [118, 146], bend: 'up' }, arm2: { ik: [128, 120] }, leg: { ik: [96, A] } },
  { t: 1, hip: [70, 102], torso: 82, arm: { ik: [98, 112], bend: 'up' }, arm2: { ik: [128, 120] }, leg: { ik: [96, A] } },
], { props: [{ kind: 'dumbbell', at: 'hand' }], scene: [{ type: 'bench', x: 112, y: 124, w: 60 }] });

const invRowBot = plank([180, 170], 9);
const invRowTop = plank([180, 170], 22);
const invertedRow = P('inverted_row', 'Rematore inverso', [
  { t: 0, ...invRowBot, head: 0, arm: { ik: [56, 98], bend: 'down' } },
  { t: 1, ...invRowTop, head: 0, arm: { ik: [56, 98], bend: 'down' } },
], { scene: [{ type: 'bar', x: 56, y: 96, w: 8 }] });

const facePull = P('face_pull', 'Face pull', [
  { t: 0, hip: STAND_HIP, torso: -4, arm: { ik: [150, 44], bend: 'down' }, leg: { ik: [96, A] }, leg2: { ik: [108, A] } },
  { t: 1, hip: STAND_HIP, torso: -4, arm: { ik: [110, 30], bend: 'back' }, leg: { ik: [96, A] }, leg2: { ik: [108, A] } },
], { props: [{ kind: 'rope', at: 'hand' }], scene: [{ type: 'cable', x: 190, y: 36, to: 'hand' }] });

const reverseFly = P('reverse_fly', 'Alzate posteriori', [
  { t: 0, hip: [80, 102], torso: 72, arm: { a: [4, 8] }, leg: { ik: [102, A] } },
  { t: 1, hip: [80, 102], torso: 72, arm: { a: [-74, -64] }, leg: { ik: [102, A] } },
], { props: dbs });

const shrug = P('shrug', 'Scrollate', [
  { t: 0, hip: STAND_HIP, torso: 0, shrug: 0, arm: { a: [0, 0] }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 0, shrug: -8, arm: { a: [0, 0] }, leg: standLeg },
], { props: dbs, duration: 2 });

const uprightRow = P('upright_row', 'Tirate al mento', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { rel: [6, 52], bend: 'up' }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { rel: [10, 2], bend: 'back' }, leg: standLeg },
], { props: bar('hand') });

const pullover = P('pullover', 'Pullover', [
  { t: 0, hip: [124, 112], torso: -90, arm: { a: [184, 190] }, leg: lyingLegs },
  { t: 1, hip: [124, 112], torso: -90, arm: { a: [258, 262] }, leg: lyingLegs },
], { props: [{ kind: 'dumbbell', at: 'hand' }], scene: [BENCH] });

const straightArm = P('straight_arm_pd', 'Pulldown a braccia tese', [
  { t: 0, hip: STAND_HIP, torso: 22, arm: { a: [150, 156] }, leg: { ik: [104, A] } },
  { t: 1, hip: STAND_HIP, torso: 22, arm: { a: [10, 14] }, leg: { ik: [104, A] } },
], { props: [{ kind: 'handle', at: 'hand' }], scene: [{ type: 'cable', x: 176, y: 12, to: 'hand' }] });

const backExt = P('back_extension', 'Hyperextension', [
  { t: 0, hip: [110, 118], torso: -150, head: 0, arm: { a: [-170, 120] }, leg: { ik: [152, 168] } },
  { t: 1, hip: [110, 118], torso: -40, head: 0, arm: { a: [-60, 150] }, leg: { ik: [152, 168] } },
], { scene: [{ type: 'pad', x: 106, y: 124, w: 22, h: 12 }, { type: 'incline', x: 100, y: 178, w: 72, angle: -40 }] });

const curl = P('curl', 'Curl', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { a: [2, 4] }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { a: [-4, 145] }, leg: standLeg },
], { props: [{ kind: 'dumbbell', at: 'hand' }] });

const curlBB = P('curl_bb', 'Curl con bilanciere', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { a: [2, 4] }, leg: standLeg },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { a: [-4, 145] }, leg: standLeg },
], { props: bar('hand') });

const preacher = P('preacher', 'Curl alla panca Scott', [
  { t: 0, hip: [86, 136], torso: 14, arm: { a: [40, 54] }, leg: { ik: [128, A], bend: 'up' } },
  { t: 1, hip: [86, 136], torso: 14, arm: { a: [40, 160] }, leg: { ik: [128, A], bend: 'up' } },
], { props: [{ kind: 'ezbar', at: 'hand' }], scene: [{ type: 'seat', x: 62, y: 145, w: 46 }, { type: 'incline', x: 104, y: 112, w: 30, angle: 50 }] });

const wristCurl = P('wrist_curl', 'Curl per avambracci', [
  { t: 0, hip: [86, 136], torso: 20, arm: { a: [40, 84] }, leg: { ik: [128, A], bend: 'up' } },
  { t: 1, hip: [86, 136], torso: 20, arm: { a: [40, 104] }, leg: { ik: [128, A], bend: 'up' } },
], { props: [{ kind: 'dumbbell', at: 'hand' }], scene: [{ type: 'seat', x: 62, y: 145, w: 46 }], duration: 1.6 });

// ---------------- Core ----------------
const floorLegs: Limb = { ik: [150, A], bend: 'up' };
const crunch = P('crunch', 'Crunch', [
  { t: 0, hip: [110, 168], torso: -90, arm: { rel: [-4, -4], bend: 'up' }, leg: floorLegs },
  { t: 1, hip: [110, 168], torso: -58, arm: { rel: [-4, -4], bend: 'up' }, leg: floorLegs },
], { scene: [{ type: 'mat', x: 20, y: 177, w: 160 }], duration: 2.2 });

const situp = P('situp', 'Sit-up', [
  { t: 0, hip: [110, 168], torso: -90, arm: { rel: [10, 6], bend: 'up' }, leg: floorLegs },
  { t: 1, hip: [110, 168], torso: -12, arm: { rel: [10, 6], bend: 'up' }, leg: floorLegs },
], { scene: [{ type: 'mat', x: 20, y: 177, w: 160 }] });

const hangingLR = P('hanging_leg_raise', 'Sollevamento gambe alla sbarra', [
  { t: 0, hip: [95, 118], torso: 2, arm: { ik: [98, 13], bend: 'fwd' }, leg: { a: [25, -50] } },
  { t: 1, hip: [97, 114], torso: -6, arm: { ik: [98, 13], bend: 'fwd' }, leg: { a: [92, 96] } },
], { scene: [{ type: 'bar', x: 98, y: 12, w: 8 }] });

const lyingLR = P('lying_leg_raise', 'Leg raise a terra', [
  { t: 0, hip: [100, 168], torso: -90, arm: { a: [90, 90] }, leg: { a: [86, 86] } },
  { t: 1, hip: [100, 168], torso: -90, arm: { a: [90, 90] }, leg: { a: [176, 176] } },
], { scene: [{ type: 'mat', x: 20, y: 177, w: 160 }] });

const russianTwist = P('russian_twist', 'Russian twist', [
  { t: 0, hip: [90, 168], torso: -38, arm: { rel: [30, 20], bend: 'down' }, leg: { a: [128, 70] } },
  { t: 1, hip: [90, 168], torso: -42, arm: { rel: [6, 30], bend: 'down' }, leg: { a: [128, 70] } },
], { props: [{ kind: 'medball', at: 'hand' }], duration: 1.8, scene: [{ type: 'mat', x: 20, y: 177, w: 160 }] });

const mcA = plank([176, 167], 24);
const mountainClimber = P('mountain_climber', 'Mountain climber', [
  { t: 0, ...mcA, leg: { ik: [176, 167] }, leg2: { ik: [112, 160], bend: 'down' }, arm: { ik: [52, 177], bend: 'up' }, foot: 80 },
  { t: 1, ...mcA, leg: { ik: [112, 160], bend: 'down' }, leg2: { ik: [176, 167] }, arm: { ik: [52, 177], bend: 'up' }, foot: 80 },
], { duration: 1 });

const deadBug = P('dead_bug', 'Dead bug', [
  { t: 0, hip: [110, 168], torso: -90, arm: { a: [180, 180] }, arm2: { a: [180, 180] }, leg: { a: [180, 90] }, leg2: { a: [180, 90] } },
  { t: 1, hip: [110, 168], torso: -90, arm: { a: [180, 180] }, arm2: { a: [262, 262] }, leg: { a: [100, 100] }, leg2: { a: [180, 90] } },
], { scene: [{ type: 'mat', x: 20, y: 177, w: 160 }] });

const quadHip: Vec = [120, 126];
const birdDog = P('bird_dog', 'Bird dog', [
  { t: 0, hip: quadHip, torso: -90, arm: { a: [0, 0] }, arm2: { a: [0, 0] }, leg: { a: [0, 90] }, leg2: { a: [0, 90] } },
  { t: 1, hip: quadHip, torso: -90, head: 6, arm: { a: [0, 0] }, arm2: { a: [-92, -92] }, leg: { a: [92, 92] }, leg2: { a: [0, 90] } },
], { scene: [{ type: 'mat', x: 20, y: 177, w: 160 }], duration: 3 });

const catCow = P('cat_cow', 'Cat-cow', [
  { t: 0, hip: [120, 126], torso: -94, head: -35, arm: { a: [0, 0] }, leg: { a: [0, 90] } },
  { t: 1, hip: [120, 128], torso: -84, head: 35, arm: { a: [4, 4] }, leg: { a: [0, 90] } },
], { scene: [{ type: 'mat', x: 20, y: 177, w: 160 }], duration: 4 });

const abWheel = P('ab_wheel', 'Ab wheel', [
  { t: 0, hip: [146, 134], torso: -38, arm: { ik: [112, 170], bend: 'fwd' }, leg: { a: [0, 90] } },
  { t: 1, hip: [124, 150], torso: -78, arm: { ik: [60, 168], bend: 'fwd' }, leg: { a: [48, 90] } },
], { props: [{ kind: 'medball', at: 'hand' }], scene: [{ type: 'mat', x: 20, y: 177, w: 170 }] });

const cableCrunch = P('cable_crunch', 'Crunch ai cavi', [
  { t: 0, hip: [100, 132], torso: 12, arm: { rel: [4, -6], bend: 'fwd' }, leg: { a: [0, -90] } },
  { t: 1, hip: [100, 132], torso: 74, arm: { rel: [8, -4], bend: 'fwd' }, leg: { a: [6, -90] } },
], { props: [{ kind: 'rope', at: 'hand' }], scene: [{ type: 'cable', x: 116, y: 6, to: 'hand' }] });

const sidePlank = P('side_plank', 'Plank laterale', [
  { t: 0, ...plank([176, 170], 16), arm: { a: [0, -90] }, arm2: { a: [180, 180] }, foot: 0 },
  { t: 1, ...plank([176, 170], 18), arm: { a: [0, -90] }, arm2: { a: [180, 180] }, foot: 0 },
], { duration: 3.4, phases: [{ t: 0, label: 'Corpo in linea, bacino alto' }] });

// ---------------- Cardio e full body ----------------
const jumpingJack = P('jumping_jack', 'Jumping jack', [
  { t: 0, hip: [100, 96], torso: 0, arm: { a: [8, 8] }, leg: { a: [2, 2] } },
  { t: 1, hip: [100, 99], torso: 0, arm: { a: [160, 170] }, leg: { a: [20, 20] } },
], { view: 'front', duration: 1 });

const burpee = P('burpee', 'Burpee', [
  { t: 0, hip: [100, 95], torso: 0, arm: { a: [0, 0] }, leg: { ik: [103, A] } },
  { t: 0.22, hip: [86, 140], torso: 60, arm: { ik: [130, 176], bend: 'fwd' }, leg: { ik: [103, A] } },
  { t: 0.45, ...plank([180, 167], 22), arm: { ik: [64, 176], bend: 'up' }, foot: 80 },
  { t: 0.68, hip: [86, 140], torso: 60, arm: { ik: [130, 176], bend: 'fwd' }, leg: { ik: [103, A] } },
  { t: 0.85, hip: [100, 88], torso: 0, arm: { a: [170, 175] }, leg: { ik: [102, 166] }, foot: 40 },
  { t: 1, hip: [100, 95], torso: 0, arm: { a: [0, 0] }, leg: { ik: [103, A] } },
], { loop: 'cycle', duration: 3, phases: [{ t: 0, label: 'In piedi' }, { t: 0.3, label: 'Mani a terra e salto in plank' }, { t: 0.75, label: 'Ritorno e salto verticale' }] });

const run = P('run', 'Corsa', [
  { t: 0, hip: [100, 92], torso: 12, arm: { a: [-40, 50] }, arm2: { a: [40, 120] }, leg: { a: [45, -20] }, leg2: { a: [-25, -80] }, foot: 0, foot2: 40 },
  { t: 0.25, hip: [100, 96], torso: 12, arm: { a: [0, 90] }, arm2: { a: [0, 90] }, leg: { a: [10, 0] }, leg2: { a: [20, -90] } },
  { t: 0.5, hip: [100, 92], torso: 12, arm: { a: [40, 120] }, arm2: { a: [-40, 50] }, leg: { a: [-25, -80] }, leg2: { a: [45, -20] }, foot: 40, foot2: 0 },
  { t: 0.75, hip: [100, 96], torso: 12, arm: { a: [0, 90] }, arm2: { a: [0, 90] }, leg: { a: [20, -90] }, leg2: { a: [10, 0] } },
  { t: 1, hip: [100, 92], torso: 12, arm: { a: [-40, 50] }, arm2: { a: [40, 120] }, leg: { a: [45, -20] }, leg2: { a: [-25, -80] }, foot: 0, foot2: 40 },
], { loop: 'cycle', duration: 0.9, scene: [{ type: 'treadmill', x: 40, y: 176, w: 130 }], phases: [{ t: 0, label: 'Appoggio sotto il baricentro, braccia rilassate' }] });

const walk = P('walk', 'Camminata', [
  { t: 0, hip: [100, 96], torso: 3, arm: { a: [-20, -10] }, arm2: { a: [20, 30] }, leg: { a: [22, 10] }, leg2: { a: [-18, -24] }, foot2: 20 },
  { t: 0.5, hip: [100, 96], torso: 3, arm: { a: [20, 30] }, arm2: { a: [-20, -10] }, leg: { a: [-18, -24] }, leg2: { a: [22, 10] }, foot: 20, foot2: 0 },
  { t: 1, hip: [100, 96], torso: 3, arm: { a: [-20, -10] }, arm2: { a: [20, 30] }, leg: { a: [22, 10] }, leg2: { a: [-18, -24] }, foot2: 20 },
], { loop: 'cycle', duration: 1.3, scene: [{ type: 'treadmill', x: 40, y: 176, w: 130 }] });

const farmer = P('farmer_walk', 'Farmer walk', walk.keys.map((k) => ({ ...k, arm: { a: [0, 0] as Vec }, arm2: { a: [0, 0] as Vec } })), { loop: 'cycle', duration: 1.3, props: dbs });

const pedal = (deg: number): Vec => [104 + Math.cos((deg * Math.PI) / 180) * 17, 150 + Math.sin((deg * Math.PI) / 180) * 17];
const bikeKeys: Keyframe[] = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
  t, hip: [84, 104], torso: 42, arm: { ik: [138, 86], bend: 'down' },
  leg: { ik: pedal(t * 360), bend: 'fwd' }, leg2: { ik: pedal(t * 360 + 180), bend: 'fwd' },
}));
const bike = P('bike', 'Cyclette', bikeKeys, { loop: 'cycle', duration: 1.1, scene: [{ type: 'bike', x: 104, y: 150 }] });

const rower = P('rower', 'Vogatore', [
  { t: 0, hip: [96, 152], torso: 26, arm: { ik: [148, 130], bend: 'down' }, leg: { ik: [140, 160], bend: 'up' }, foot: -60 },
  { t: 0.55, hip: [64, 152], torso: -22, arm: { ik: [88, 126], bend: 'back' }, leg: { ik: [140, 160], bend: 'up' }, foot: -60 },
  { t: 1, hip: [96, 152], torso: 26, arm: { ik: [148, 130], bend: 'down' }, leg: { ik: [140, 160], bend: 'up' }, foot: -60 },
], { loop: 'cycle', duration: 2.4, scene: [{ type: 'rower', x: 20, y: 162, w: 160 }], phases: [{ t: 0, label: 'Presa: tibie verticali' }, { t: 0.5, label: 'Spinta di gambe, poi busto e braccia' }] });

const jumpRope = P('jump_rope', 'Salto della corda', [
  { t: 0, hip: [100, 96], torso: 0, arm: { a: [20, 70] }, leg: { ik: [102, A] } },
  { t: 1, hip: [100, 88], torso: 0, arm: { a: [24, 76] }, leg: { ik: [102, 165] }, foot: 40 },
], { duration: 0.5, props: [{ kind: 'handle', at: 'hand' }] });

const elliptical = P('elliptical', 'Ellittica', walk.keys.map((k) => ({ ...k, arm: { ik: [140, 84], bend: 'down' as const }, arm2: { ik: [134, 92], bend: 'down' as const } })), { loop: 'cycle', duration: 1.4 });

// ---------------- Mobilità e stretching ----------------
const hamStretch = P('stretch_hamstring', 'Allungamento femorali', [
  { t: 0, hip: [80, 166], torso: 18, arm: { a: [70, 80] }, leg: { a: [90, 90] } },
  { t: 1, hip: [80, 166], torso: 62, arm: { ik: [152, 164], bend: 'up' }, leg: { a: [90, 90] } },
], { duration: 5, scene: [{ type: 'mat', x: 20, y: 177, w: 160 }], phases: [{ t: 0, label: 'Busto eretto' }, { t: 0.5, label: 'Flessione dalle anche, schiena lunga: mantieni 20-30 s' }] });

const quadStretch = P('stretch_quad', 'Allungamento quadricipiti', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { ik: [70, 116], bend: 'down' }, leg: { a: [-4, 168] }, leg2: { ik: [102, A] } },
  { t: 1, hip: STAND_HIP, torso: 2, arm: { ik: [68, 114], bend: 'down' }, leg: { a: [-10, 172] }, leg2: { ik: [102, A] } },
], { duration: 4 });

const hipFlexor = P('stretch_hip_flexor', 'Allungamento flessori dell’anca', [
  { t: 0, hip: [100, 132], torso: 0, arm: { a: [10, 30] }, leg: { ik: [140, A] }, leg2: { a: [-30, -90] } },
  { t: 1, hip: [112, 138], torso: -4, arm: { a: [10, 30] }, leg: { ik: [140, A] }, leg2: { a: [-46, -90] } },
], { duration: 4.5, scene: [{ type: 'mat', x: 20, y: 177, w: 160 }] });

const cobra = P('cobra', 'Cobra', [
  { t: 0, hip: [120, 170], torso: -90, head: 0, arm: { ik: [70, 176], bend: 'up' }, leg: { a: [90, 90] }, foot: 0 },
  { t: 1, hip: [120, 170], torso: -58, head: 24, arm: { ik: [82, 176], bend: 'back' }, leg: { a: [90, 90] }, foot: 0 },
], { duration: 4, scene: [{ type: 'mat', x: 20, y: 177, w: 160 }] });

const childPose = P('child_pose', 'Posizione del bambino', [
  { t: 0, hip: [124, 142], torso: -102, head: -6, arm: { a: [-82, -86] }, leg: { a: [-42, 90] } },
  { t: 1, hip: [124, 140], torso: -98, head: -6, arm: { a: [-84, -86] }, leg: { a: [-40, 90] } },
], { duration: 5, scene: [{ type: 'mat', x: 20, y: 177, w: 160 }] });

const armCircles = P('arm_circles', 'Mobilità spalle', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { a: [60, 60] }, leg: { a: [3, 3] } },
  { t: 0.33, hip: STAND_HIP, torso: 0, arm: { a: [120, 120] }, leg: { a: [3, 3] } },
  { t: 0.66, hip: STAND_HIP, torso: 0, arm: { a: [175, 175] }, leg: { a: [3, 3] } },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { a: [60, 60] }, leg: { a: [3, 3] } },
], { view: 'front', loop: 'cycle', duration: 3 });

const gluteKick = P('glute_kickback', 'Slanci posteriori', [
  { t: 0, hip: quadHip, torso: -90, arm: { a: [0, 0] }, leg: { a: [0, 90] }, leg2: { a: [0, 90] } },
  { t: 1, hip: quadHip, torso: -90, arm: { a: [0, 0] }, leg: { a: [104, 170] }, leg2: { a: [0, 90] } },
], { scene: [{ type: 'mat', x: 20, y: 177, w: 160 }], duration: 2 });

const hipCircle = P('hip_mobility', 'Mobilità anche', [
  { t: 0, hip: STAND_HIP, torso: 0, arm: { a: [20, 40] }, leg: { ik: [104, A] }, leg2: { a: [40, 0] } },
  { t: 0.5, hip: STAND_HIP, torso: 0, arm: { a: [20, 40] }, leg: { ik: [104, A] }, leg2: { a: [100, 10] } },
  { t: 1, hip: STAND_HIP, torso: 0, arm: { a: [20, 40] }, leg: { ik: [104, A] }, leg2: { a: [40, 0] } },
], { loop: 'cycle', duration: 2.8 });

export const PATTERNS: Pattern[] = [
  squatBB, squatFront, squatGoblet, squatBW, wallSit, deadlift, rdl, goodMorning, hipThrust, gluteBridge, lunge,
  bulgarian, stepUp, legPress, legExtension, legCurl, calfRaise, seatedCalf, hipAbduction, sideLunge, kbSwing,
  boxJump, jumpSquat, thruster, benchPress, dbBench, inclinePress, dbFly, pushUp, plankPose, dip, benchDip, ohp,
  seatedPress, lateralRaise, frontRaise, chestPress, pecDeck, cableFly, pushdown, ohExt, skull, kickback, pullup,
  latPulldown, seatedRow, bentRow, oneArmRow, invertedRow, facePull, reverseFly, shrug, uprightRow, pullover,
  straightArm, backExt, curl, curlBB, preacher, wristCurl, crunch, situp, hangingLR, lyingLR, russianTwist,
  mountainClimber, deadBug, birdDog, catCow, abWheel, cableCrunch, sidePlank, jumpingJack, burpee, run, walk,
  farmer, bike, rower, jumpRope, elliptical, hamStretch, quadStretch, hipFlexor, cobra, childPose, armCircles,
  gluteKick, hipCircle,
];

export const PATTERN_MAP: Record<string, Pattern> = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));
export { shoulderOf };
