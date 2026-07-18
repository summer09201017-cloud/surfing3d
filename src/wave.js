// ══════════════════════════════════════════════════════════════════════
// wave.js —— 「浪=會動的地形」(C4 extreme-terrain-kit × water-kit 雙拼)
// 把 terrain.js 的 U 型斷面換成「站浪」(FlowRider 式定點浪),再疊 water-kit 的
// waterHeightAt 漣漪 → 得到一個會呼吸、有細波的浪面高度場 waveHeightAt(x,z,t)。
// 介面與 terrain.js 對齊(heightAt/slopeAt/lipInfo/createMesh/alignTo),只是全部帶 t。
// ══════════════════════════════════════════════════════════════════════
import * as THREE from "three";
import { waterHeightAt } from "./water.js";

// ── 量值可調:浪的形狀與呼吸 ──
export const WAVE = {
  flat: 2.4,        // 浪槽平坦區半寬(m)
  radius: 3.2,      // 浪壁過渡弧半徑=浪頂高(m)
  length: 26,       // 浪道長(x 軸)
  breath: 0.1,      // 浪「呼吸」振幅(整體高度 ±10%)
  breathSpeed: 0.55,
  rippleMul: 0.55,  // water-kit 漣漪疊加倍率
  colorFace: 0x2e8fc9, // 浪面(比外海亮)
};

// U 型站浪斷面(同 halfpipeProfile)
export function waveProfile(z) {
  const a = Math.abs(z) - WAVE.flat;
  if (a <= 0) return 0;
  const t = Math.min(a, WAVE.radius);
  return WAVE.radius - Math.sqrt(Math.max(0, WAVE.radius * WAVE.radius - t * t));
}

// ★心臟:浪面高度場(斷面 × 呼吸 + water-kit 漣漪)——板、人、浪 mesh 全用它=判定=畫面
export function waveHeightAt(x, z, t) {
  const breath = 1 + WAVE.breath * Math.sin(t * WAVE.breathSpeed + x * 0.09);
  return waveProfile(z) * breath + waterHeightAt(x, z, t) * WAVE.rippleMul;
}

export function waveSlopeAt(x, z, t) {
  const e = 0.12;
  return {
    dx: (waveHeightAt(x + e, z, t) - waveHeightAt(x - e, z, t)) / (2 * e),
    dz: (waveHeightAt(x, z + e, t) - waveHeightAt(x, z - e, t)) / (2 * e),
  };
}

export function lipInfo() {
  return { z: WAVE.flat + WAVE.radius, height: WAVE.radius };
}

// 浪面 mesh:位移 PlaneGeometry,每幀 update(t) 刷頂點(這點跟靜態 terrain 不同,跟 water 相同)
export function createWaveMesh({ width = WAVE.length, length = (WAVE.flat + WAVE.radius) * 2 + 1.2, segX = 48, segZ = 96 } = {}) {
  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: WAVE.colorFace, roughness: 0.35, metalness: 0.06,
    transparent: true, opacity: 0.92, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const pos = geo.attributes.position;
  const bx = new Float32Array(pos.count);
  const bz = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { bx[i] = pos.getX(i); bz[i] = pos.getZ(i); }
  return {
    mesh,
    update(t) {
      for (let i = 0; i < pos.count; i++) pos.setY(i, waveHeightAt(bx[i], bz[i], t));
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

// 貼浪(★atan 鐵則同 terrain.js:slope 直接當弧度會在陡浪壁把人埋進浪裡)
export function alignToWave(obj, x, z, t, { offset = 0, tiltMul = 1 } = {}) {
  const h = waveHeightAt(x, z, t);
  obj.position.y = h + offset;
  const s = waveSlopeAt(x, z, t);
  obj.rotation.x = Math.atan(s.dz) * tiltMul;
  obj.rotation.z = -Math.atan(s.dx) * tiltMul;
  return h;
}
