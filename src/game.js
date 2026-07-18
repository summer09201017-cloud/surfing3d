// 3D 衝浪(定點浪計分賽)—— 單一 class(場景+狀態機+物理+動畫),不碰 DOM(照 3d-game-kit 三件套)
// C4 收官:terrain×water 雙拼——浪=會動的地形。高度場在 src/wave.js(waveHeightAt=
// U 型站浪斷面×呼吸+water-kit 漣漪),水花/漣漪收割 water.js 的 SplashSystem。
// 玩法同滑板家族:泵速→衝出浪頂騰空→空中轉體/抓板→落浪結算(穩=combo)。
// 永不會輸:落浪不穩=噗通一聲大水花,馬上爬回板上,不受傷。
import * as THREE from "three";
import { WAVE, waveHeightAt, waveSlopeAt, lipInfo, createWaveMesh, alignToWave } from "./wave.js";
import { WATER, createWaterSurface, SplashSystem, createLaneRope } from "./water.js";

export const DIFFICULTY_LABELS = {
  kids: "幼兒", child: "兒童", easy: "入門", normal: "標準", hard: "職業",
};

// 五檔難度(量值鐵則;寧可偏簡單)
export const DIFFICULTY_PRESETS = {
  kids:   { runSeconds: 40, pump: 7.5, maxSpeed: 8.0,  assist: 80, stars: [120, 320, 600] },
  child:  { runSeconds: 50, pump: 7.0, maxSpeed: 8.5,  assist: 65, stars: [220, 520, 900] },
  easy:   { runSeconds: 60, pump: 6.5, maxSpeed: 9.0,  assist: 55, stars: [320, 720, 1200] },
  normal: { runSeconds: 60, pump: 6.0, maxSpeed: 9.5,  assist: 45, stars: [420, 950, 1550] },
  hard:   { runSeconds: 75, pump: 5.6, maxSpeed: 10.0, assist: 35, stars: [600, 1300, 2100] },
};

const G = 9.8;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);

export class SurfingGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.difficulty = "easy";

    this.phase = "menu"; // menu → run → done
    this.message = "選擇難度後開始。";
    this.time = 0;
    this.hudTimer = 0;
    this.cameraView = 0;

    this.onHud = null;
    this.onEvent = null;

    this.controls = { left: false, right: false, pumpHeld: false };

    this.s = {
      z: 0, v: 0, x: 0,
      airborne: false, y: 0, vy: 0, side: 1,
      spin: 0, spinVel: 0, grabT: 0, maxY: 0,
      heading: 1, crouch: 0, wobbleT: 0, airT: 0, wakeT: 0,
    };
    this.timeLeft = 60;
    this.score = 0;
    this.combo = 0;
    this.bestTrick = { label: "—", points: 0 };
    this.lastTenWarned = false;

    // ── Three 場景(熱帶海) ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd4ef);
    this.scene.fog = new THREE.Fog(0x9fd4ef, 50, 130);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
    this._camPos = new THREE.Vector3(12, 5, 8);
    this._camLook = new THREE.Vector3(0, 1.2, 0);
    this.camera.position.copy(this._camPos);

    const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x3a6a84, 1.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2cf, 1.15);
    sun.position.set(-14, 26, 12);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfe9ff, 0.4);
    fill.position.set(14, 16, -10);
    this.scene.add(fill);

    this.buildSea();
    this.surfer = this.makeSurfer();
    this.scene.add(this.surfer.group);

    this.clock = new THREE.Clock();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.startLoop();
  }

  emitEvent(type, payload = {}) { if (this.onEvent) this.onEvent({ type, ...payload }); }
  get preset() { return DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.easy; }

  // ── 場景:站浪 + 外海 + 沙灘棕櫚(terrain×water 雙拼) ──
  buildSea() {
    // ★浪面(每幀 update)
    this.wave = createWaveMesh({ segX: 40, segZ: 100 });
    this.scene.add(this.wave.mesh);
    this.lip = lipInfo();

    // 外海(water-kit 水面,包住浪道)
    this.ocean = createWaterSurface({ width: 150, length: 130, segX: 60, segZ: 52, color: WATER.colorDeep });
    this.ocean.mesh.position.y = -0.12; // 略低於浪槽,浪面蓋在上面
    this.scene.add(this.ocean.mesh);

    // 海底(深色打底)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(170, 150),
      new THREE.MeshStandardMaterial({ color: 0x0d2a3c, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4;
    this.scene.add(floor);

    // 沙灘(-z 遠側)+ 棕櫚 + 遮陽傘
    const sand = new THREE.Mesh(new THREE.BoxGeometry(150, 0.6, 26), new THREE.MeshStandardMaterial({ color: 0xe8d5a3, roughness: 1 }));
    sand.position.set(0, -0.1, -(this.lip.z + 17));
    this.scene.add(sand);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 0.9 });
    for (const [px, pz] of [[-14, -16], [-4, -18], [7, -16.5], [16, -18]]) {
      const tree = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.15 - i * 0.014, 0.18 - i * 0.014, 0.95, 8), trunkMat);
        seg.position.set(Math.sin(i * 0.35) * 0.32, 0.48 + i * 0.9, 0);
        tree.add(seg);
      }
      for (let k = 0; k < 6; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.4, 5), leafMat);
        const a = (k / 6) * Math.PI * 2;
        leaf.position.set(0.3 + Math.cos(a) * 0.95, 4.85, Math.sin(a) * 0.95);
        leaf.rotation.z = Math.cos(a) * 1.25;
        leaf.rotation.x = -Math.sin(a) * 1.25;
        tree.add(leaf);
      }
      tree.position.set(px, 0.2, pz - this.lip.z);
      this.scene.add(tree);
    }
    // 遮陽傘 ×3
    for (const [ux, uz, uc] of [[-9, -15, 0xe8503a], [2, -16.5, 0xffd23f], [12, -15.5, 0x3d76ae]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8), trunkMat);
      pole.position.set(ux, 1.0, uz - this.lip.z);
      this.scene.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 10), new THREE.MeshStandardMaterial({ color: uc, roughness: 0.85, side: THREE.DoubleSide }));
      top.position.set(ux, 2.0, uz - this.lip.z);
      this.scene.add(top);
    }

    // 浮球界線(water-kit createLaneRope):標出浪道兩端
    this.ropes = [
      createLaneRope(this.scene, { from: { x: -WAVE.length / 2, z: -this.lip.z - 1 }, to: { x: -WAVE.length / 2, z: this.lip.z + 1 } }),
      createLaneRope(this.scene, { from: { x: WAVE.length / 2, z: -this.lip.z - 1 }, to: { x: WAVE.length / 2, z: this.lip.z + 1 } }),
    ];

    // ★水花系統(water-kit):落浪/騰空出水/尾流全共用
    this.splash = new SplashSystem(this.scene);
  }

  // 衝浪手(★臉部鐵則+裝束寫實:赤膊+衝浪褲+防曬髮色;浮板無輪)
  makeSurfer() {
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    const skin = new THREE.MeshStandardMaterial({ color: 0xe9c496, roughness: 0.7, emissive: 0x7a6446, emissiveIntensity: 0.4 });
    const shorts = new THREE.MeshStandardMaterial({ color: 0xe8503a, roughness: 0.9 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x23190f });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // 浮板(圓頭長板+中線色帶)
    const board = new THREE.Group();
    const deckM = new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.5 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 1.5), deckM);
    board.add(deck);
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 12, 1, false, 0, Math.PI), deckM);
    nose.rotation.z = Math.PI / 2; nose.rotation.y = Math.PI / 2;
    nose.position.set(0, 0, 0.75);
    board.add(nose);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 1.5), new THREE.MeshStandardMaterial({ color: 0xe8503a, roughness: 0.5 }));
    board.add(stripe);
    const finM = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 4), new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.6 }));
    finM.rotation.x = Math.PI;
    finM.position.set(0, -0.14, -0.62);
    board.add(finM);
    board.position.y = 0.08;
    g.add(board);

    // 腿(衝浪站姿=前後開、微蹲)
    const mkLeg = (z) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.98, z);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.15), skin);
      thigh.position.y = -0.21;
      pivot.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.13), skin);
      shin.position.y = -0.6;
      pivot.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), skin);
      foot.position.set(0, -0.82, 0.03);
      pivot.add(foot);
      g.add(pivot);
      return pivot;
    };
    const legF = mkLeg(0.3);
    const legB = mkLeg(-0.3);

    // 衝浪褲+赤膊軀幹
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.3), shorts);
    hip.position.y = 1.06;
    g.add(hip);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.26), skin);
    torso.position.y = 1.44;
    g.add(torso);

    // 手臂(平衡張開)
    const mkArm = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.62, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.46, 0.11), skin);
      arm.position.y = -0.23;
      pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skin);
      hand.position.y = -0.5;
      pivot.add(hand);
      g.add(pivot);
      return pivot;
    };
    const armL = mkArm(-0.3), armR = mkArm(0.3);

    // 頭+臉+短髮(衝浪無盔,髮罩)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 16), skin);
    head.position.y = 1.92;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0x4a331f, roughness: 1 }));
    hair.position.y = 1.95;
    g.add(hair);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), white);
    eyeL.position.set(-0.07, 1.94, 0.155);
    g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.07; g.add(eyeR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 8), dark);
    pupilL.position.set(-0.07, 1.94, 0.19); g.add(pupilL);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.07; g.add(pupilR);
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.016), dark);
    browL.position.set(-0.07, 2.0, 0.17); browL.rotation.z = 0.14; g.add(browL);
    const browR = browL.clone(); browR.position.x = 0.07; browR.rotation.z = -0.14; g.add(browR);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 12, Math.PI), dark);
    smile.position.set(0, 1.85, 0.165); smile.rotation.z = Math.PI; g.add(smile);

    return { group: g, board, legF, legB, armL, armR };
  }

  // ── 流程 API ──
  applyPresentation({ difficulty }) {
    if (difficulty && DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
  }

  start() {
    const p = this.preset;
    this.phase = "run";
    this.timeLeft = p.runSeconds;
    this.score = 0;
    this.combo = 0;
    this.bestTrick = { label: "—", points: 0 };
    this.lastTenWarned = false;
    Object.assign(this.s, {
      z: 0, v: 2.2, x: 0, airborne: false, y: 0, vy: 0, side: 1,
      spin: 0, spinVel: 0, grabT: 0, maxY: 0, heading: 1, crouch: 0, wobbleT: 0, airT: 0, wakeT: 0,
    });
    this.surfer.group.rotation.set(0, 0, 0);
    this.message = "按住「泵」順著浪壁加速,衝出浪頂飛起來!";
    this.emitEvent("run-start");
    this.pushHud();
  }

  cycleCameraView() {
    this.cameraView = (this.cameraView + 1) % 3;
    const names = ["斜側視角", "正側轉播", "高空俯瞰"];
    this.message = `視角:${names[this.cameraView]}`;
    this.pushHud();
  }

  // ── 主迴圈 ──
  startLoop() {
    if (this._raf) return;
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.time += dt;
      this.update(dt);
      this.renderFrame(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  update(dt) {
    if (this.phase !== "run") return;
    const p = this.preset;
    const s = this.s;

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 10 && !this.lastTenWarned) {
      this.lastTenWarned = true;
      this.message = "最後十秒——拼一波大招!";
      this.emitEvent("ten-left");
    }
    if (this.timeLeft <= 0 && !s.airborne) {
      this.endRun();
      return;
    }

    if (s.airborne) this.updateAir(dt);
    else this.updateGround(dt, p);
    this.hudTick(dt);
  }

  updateGround(dt, p) {
    const s = this.s;
    const slope = waveSlopeAt(s.x, s.z, this.time).dz;

    s.v += -G * slope * dt;
    s.v *= Math.max(0, 1 - 0.06 * dt);

    // ★泵:往浪槽下坡時按住=加速
    const downhill = Math.abs(s.z) > WAVE.flat * 0.6 && Math.sign(s.v) === -Math.sign(s.z) && Math.abs(s.v) > 0.3;
    if (this.controls.pumpHeld && downhill) {
      s.v += Math.sign(s.v) * p.pump * dt;
      s.crouch = Math.min(1, s.crouch + dt * 6);
    } else {
      s.crouch = Math.max(0, s.crouch - dt * 5);
    }
    s.v = clamp(s.v, -p.maxSpeed, p.maxSpeed);

    if (Math.abs(s.v) < 1.2 && Math.abs(s.z) < WAVE.flat) {
      s.v += (s.v >= 0 ? 1 : -1) * 1.5 * dt;
    }

    const drift = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
    s.x = clamp(s.x + drift * 2.2 * dt, -WAVE.length / 2 + 2, WAVE.length / 2 - 2);

    s.z += s.v * dt;
    if (Math.abs(s.v) > 0.2) s.heading = Math.sign(s.v);

    // 尾流水花(★water-kit:速度夠快船尾灑花)
    const sp = Math.abs(s.v);
    if (sp > 3.5) {
      s.wakeT -= dt;
      if (s.wakeT <= 0) {
        s.wakeT = 0.3 - Math.min(0.16, sp * 0.015);
        this.splash.spawn(s.x, s.z, 0.2, this.time);
      }
    }

    // ★衝出浪頂=騰空
    const lipZ = this.lip.z - 0.05;
    if (Math.abs(s.z) >= lipZ) {
      const outward = Math.sign(s.z);
      if (Math.sign(s.v) === outward && Math.abs(s.v) > 2.2) {
        s.airborne = true;
        s.side = outward;
        s.z = lipZ * outward;
        s.y = waveHeightAt(s.x, s.z, this.time);
        s.vy = Math.abs(s.v) * 0.92;
        s.maxY = s.y;
        s.spin = 0; s.spinVel = 0; s.grabT = 0; s.airT = 0;
        this.splash.spawn(s.x, s.z, 0.6, this.time); // 切浪出水花
        this.emitEvent("air", { speed: Math.abs(s.v) });
      } else {
        s.z = lipZ * Math.sign(s.z);
        s.v = -Math.sign(s.z) * Math.max(Math.abs(s.v) * 0.4, 0.8);
      }
    }
    if (s.wobbleT > 0) s.wobbleT -= dt;
  }

  updateAir(dt) {
    const s = this.s;
    s.airT += dt;
    s.vy -= G * dt;
    s.y += s.vy * dt;
    s.maxY = Math.max(s.maxY, s.y);

    const spinDir = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
    s.spinVel = lerp(s.spinVel, spinDir * 420, 1 - Math.exp(-dt * 6));
    s.spin += s.spinVel * dt;
    if (this.controls.pumpHeld) s.grabT += dt;

    // 回落到浪面=落浪(浪會呼吸,用即時高度)
    if (s.y <= waveHeightAt(s.x, s.z, this.time) && s.vy < 0) this.land();
  }

  land() {
    const p = this.preset;
    const s = this.s;
    const baseY = waveHeightAt(s.x, s.z, this.time);
    const heightGain = Math.max(0, s.maxY - baseY);
    const spinAbs = Math.abs(s.spin);
    const halfTurns = Math.round(spinAbs / 180);
    const spinDeg = halfTurns * 180;
    const offBy = Math.abs(spinAbs - spinDeg);
    const clean = offBy <= p.assist;
    const grabbed = s.grabT >= 0.22;

    let pts = 10 + Math.round(heightGain * 15) + halfTurns * 25 + (grabbed ? 20 : 0) + (clean ? 15 : 0);
    if (clean) this.combo = Math.min(this.combo + 1, 5);
    else this.combo = 0;
    const mult = 1 + this.combo * 0.15;
    pts = Math.round((pts * mult) / 5) * 5;
    this.score += pts;

    const parts = [];
    if (spinDeg >= 180) parts.push(`${spinDeg}° 轉體`);
    if (grabbed) parts.push("抓板");
    if (heightGain > 1.4) parts.push("高飛");
    if (!parts.length) parts.push("小騰空");
    const label = parts.join("+");
    if (pts > this.bestTrick.points) this.bestTrick = { label, points: pts };

    s.airborne = false;
    s.z = (this.lip.z - 0.45) * s.side;
    s.v = -s.side * Math.max(0, -s.vy) * (clean ? 0.9 : 0.5);
    s.v = clamp(s.v, -p.maxSpeed, p.maxSpeed);
    s.wobbleT = clean ? 0 : 0.8;
    this.surfer.group.rotation.y = 0;
    // ★落浪水花:穩=中花,落水=大花(water-kit)
    this.splash.spawn(s.x, s.z, clean ? 0.55 : 1, this.time);

    this.message = clean
      ? `${label}!+${pts} 分${this.combo >= 2 ? `(連招 ×${(1 + this.combo * 0.15).toFixed(2)})` : ""}`
      : `${label}——噗通!濺起大水花,+${pts} 分,爬回板上再來!`;
    this.emitEvent("trick", { label, points: pts, clean, combo: this.combo, heightGain, spinDeg, grabbed });
    if (this.timeLeft <= 0) this.endRun();
    this.pushHud();
  }

  endRun() {
    this.phase = "done";
    const [, s2, s3] = this.preset.stars;
    const stars = this.score >= s3 ? 3 : this.score >= s2 ? 2 : 1;
    const starStr = "⭐".repeat(stars);
    const title = stars === 3 ? `${starStr} 完美浪人!` : stars === 2 ? `${starStr} 好厲害!` : `${starStr} 完賽!`;
    const text = stars === 3
      ? `總分 ${this.score}!高度、轉體、抓板全都到位——今天這道浪是你的!🏄`
      : stars === 2
        ? `總分 ${this.score}!浪感越來越順了——泵得再快一點、轉體多半圈,三星就是你的!`
        : `總分 ${this.score}!每一次騰空都是進步——下坡時按住「泵」,衝出浪頂就能飛!`;
    this.message = "時間到!";
    this.emitEvent("run-end", { score: this.score, stars, title, text, bestTrick: this.bestTrick });
    this.pushHud();
  }

  // ── HUD ──
  hudTick(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.pushHud();
    }
  }

  pushHud() {
    if (!this.onHud) return;
    const p = this.preset;
    this.onHud({
      phase: this.phase,
      message: this.message,
      timeLeft: this.timeLeft,
      score: this.score,
      combo: this.combo,
      bestTrick: this.bestTrick,
      speedNorm: clamp(Math.abs(this.s.v) / p.maxSpeed, 0, 1),
      airborne: this.s.airborne,
      meterActive: this.phase === "run",
    });
  }

  // ── 呈現 ──
  renderFrame(dt) {
    const s = this.s;
    const sk = this.surfer;

    // ★浪面+外海+水花:每幀都活的(浪=會動的地形)
    if (this.wave) this.wave.update(this.time);
    if (this.ocean) this.ocean.update(this.time);
    if (this.ropes) for (const r of this.ropes) r.update(this.time);
    if (this.splash) this.splash.update(dt, this.time);

    if (this.phase !== "menu") {
      sk.group.position.x = s.x;
      sk.group.position.z = s.z;

      if (s.airborne) {
        sk.group.position.y = s.y;
        sk.group.rotation.x = 0;
        sk.group.rotation.z = -s.side * 0.12;
        sk.group.rotation.y = THREE.MathUtils.degToRad(s.spin) * s.side;
        const tuck = this.controls.pumpHeld ? 1 : 0.55;
        sk.legF.rotation.x = -0.9 * tuck;
        sk.legB.rotation.x = 0.9 * tuck;
        if (this.controls.pumpHeld) {
          sk.armR.rotation.x = -2.6; // 下伸抓板
          sk.armL.rotation.x = Math.PI * 0.75;
          sk.armL.rotation.z = 0;
          sk.armR.rotation.z = 0;
        } else {
          sk.armL.rotation.z = 1.1;
          sk.armR.rotation.z = -1.1;
          sk.armL.rotation.x = 0;
          sk.armR.rotation.x = 0;
        }
      } else if (this.phase === "done") {
        sk.group.rotation.set(0, 0, 0);
        alignToWave(sk.group, s.x, s.z, this.time, { offset: 0, tiltMul: 0.4 });
        sk.armR.rotation.x = -Math.PI * 0.85 + Math.sin(this.time * 4) * 0.25;
        sk.armR.rotation.z = 0;
        sk.armL.rotation.z = 0.3;
        sk.armL.rotation.x = 0;
        sk.legF.rotation.x = -0.15;
        sk.legB.rotation.x = 0.15;
      } else {
        // 浪上:貼浪面(帶 t;offset 抬離水面、tiltMul 收斂——衝浪不像滑板全貼陡壁)
        alignToWave(sk.group, s.x, s.z, this.time, { offset: 0.12, tiltMul: 0.6 });
        sk.group.rotation.y = s.heading > 0 ? 0 : Math.PI;
        sk.armL.rotation.z = 0.35;
        sk.armR.rotation.z = -0.35;
        sk.armL.rotation.x = 0;
        sk.armR.rotation.x = 0;
        const bend = 0.35 + s.crouch * 0.55;
        sk.legF.rotation.x = -bend * 0.7;
        sk.legB.rotation.x = bend * 0.7;
        sk.group.position.y += -s.crouch * 0.16;
        if (s.wobbleT > 0) {
          sk.group.rotation.z += Math.sin(this.time * 26) * 0.16 * s.wobbleT;
          sk.armL.rotation.z = 0.9;
          sk.armR.rotation.z = -0.9;
        }
      }
    }

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    const s = this.s;
    const k = 1 - Math.exp(-dt * 3);
    const py = s.airborne ? s.y : waveHeightAt(s.x, s.z, this.time);
    const focus = new THREE.Vector3(s.x, py * 0.6 + 1.2, s.z * 0.55);
    const offsets = [
      new THREE.Vector3(10.5, 4.6, 7.5),
      new THREE.Vector3(13.5, 3.4, 0),
      new THREE.Vector3(0.1, 17, 4),
    ];
    this._camLook.lerp(focus, k);
    this._camPos.lerp(focus.clone().add(offsets[this.cameraView]), k);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
