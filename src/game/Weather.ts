import * as THREE from 'three';
import type { GraphicsProfile } from './graphics';
import { floodlightPositions, grassTexture } from './Pitch';
import { disposeObject } from './renderer';

/**
 * Weather and time of day for a match: sky and fog colours, the sun's colour
 * and angle, floodlights at night, cloud shadows drifting over the grass,
 * rain streaks or snowflakes, stars and a moon. It finds the scene's lights
 * itself, so the match scene only has to create it and call update().
 */
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow';
export type TimeOfDay = 'day' | 'sunset' | 'night';
export interface Conditions { weather: WeatherKind; time: TimeOfDay }

export type WeatherChoice = 'random' | 'sunny' | 'cloudy' | 'rain' | 'snow' | 'sunset' | 'night';
export const WEATHER_CHOICES: { id: WeatherChoice; label: string }[] = [
  { id: 'random', label: '🎲 Surprise me' },
  { id: 'sunny', label: '☀️ Sunny' },
  { id: 'cloudy', label: '⛅ Cloudy' },
  { id: 'rain', label: '🌧️ Rain' },
  { id: 'snow', label: '❄️ Snow' },
  { id: 'sunset', label: '🌇 Sunset' },
  { id: 'night', label: '🌙 Night' },
];

/** Turn a menu choice into concrete conditions. 'random' leans sunny so the usual game looks bright. */
export function resolveConditions(choice: WeatherChoice, rng: () => number = Math.random): Conditions {
  switch (choice) {
    case 'sunny': return { weather: 'clear', time: 'day' };
    case 'cloudy': return { weather: 'cloudy', time: 'day' };
    case 'rain': return { weather: 'rain', time: rng() < 0.3 ? 'night' : 'day' };
    case 'snow': return { weather: 'snow', time: rng() < 0.3 ? 'night' : 'day' };
    case 'sunset': return { weather: rng() < 0.3 ? 'cloudy' : 'clear', time: 'sunset' };
    case 'night': return { weather: rng() < 0.2 ? 'rain' : 'clear', time: 'night' };
    default: {
      const r = rng();
      const weather: WeatherKind = r < 0.5 ? 'clear' : r < 0.72 ? 'cloudy' : r < 0.88 ? 'rain' : 'snow';
      const t = rng();
      const time: TimeOfDay = t < 0.62 ? 'day' : t < 0.8 ? 'sunset' : 'night';
      return { weather, time };
    }
  }
}

export function describeConditions(c: Conditions): string {
  const w = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rainy', snow: 'Snowy' }[c.weather];
  const t = { day: 'afternoon', sunset: 'evening', night: 'night under the lights' }[c.time];
  return `${w} ${t}`;
}

interface Look { sky: string; fog: string; sun: string; sunIntensity: number; sunPos: [number, number, number]; hemiSky: string; hemiGround: string; hemiIntensity: number; exposure: number }

function lookFor(c: Conditions): Look {
  const base: Look = { sky: '#8fd3ff', fog: '#8fd3ff', sun: '#ffffff', sunIntensity: 2.2, sunPos: [-12, 30, 18], hemiSky: '#dff3ff', hemiGround: '#3b7f4e', hemiIntensity: 1.25, exposure: 1.15 };
  if (c.time === 'sunset') Object.assign(base, { sky: '#ffb36b', fog: '#ffc994', sun: '#ffb070', sunIntensity: 2.0, sunPos: [-28, 12, 10], hemiSky: '#ffd3a8', hemiGround: '#5a4a3a', hemiIntensity: 1.0, exposure: 1.1 });
  if (c.time === 'night') Object.assign(base, { sky: '#0e1a33', fog: '#101d38', sun: '#aebfe8', sunIntensity: 0.55, sunPos: [-6, 34, 10], hemiSky: '#2e3b5e', hemiGround: '#141c2a', hemiIntensity: 0.3, exposure: 1.0 });
  if (c.weather === 'cloudy') {
    if (c.time === 'day') Object.assign(base, { sky: '#b9c7d6', fog: '#c3cfdb', sun: '#f4f6fa', sunIntensity: 1.5, hemiSky: '#d9e1ea', hemiIntensity: 1.1 });
    else if (c.time === 'sunset') Object.assign(base, { sky: '#d59a7a', fog: '#d8ab92', sunIntensity: 1.4 });
  }
  if (c.weather === 'rain') {
    if (c.time === 'night') Object.assign(base, { sky: '#0a1226', fog: '#0c162c', sunIntensity: 0.45 });
    else Object.assign(base, { sky: '#7f8c9b', fog: '#8c98a6', sun: '#e8ecf2', sunIntensity: 1.2, hemiSky: '#aab4c0', hemiGround: '#2f5a3e', hemiIntensity: 1.0, exposure: 1.0 });
  }
  if (c.weather === 'snow') {
    if (c.time === 'night') Object.assign(base, { sky: '#1a2440', fog: '#222e4d', sunIntensity: 0.6 });
    else Object.assign(base, { sky: '#d7dfe8', fog: '#e2e8ef', sun: '#ffffff', sunIntensity: 1.6, hemiSky: '#eef2f6', hemiGround: '#8d9aa3', hemiIntensity: 1.2 });
  }
  return base;
}

export class Weather {
  private readonly group = new THREE.Group();
  private rain: { mesh: THREE.LineSegments; pos: Float32Array; n: number } | null = null;
  private snow: { mesh: THREE.Points; pos: Float32Array; phase: Float32Array; n: number } | null = null;
  private clouds: THREE.Mesh[] = [];
  private time = 0;
  private readonly fogDistance: [number, number];

  constructor(private readonly scene: THREE.Scene, private readonly dims: { length: number; width: number }, readonly conditions: Conditions, gfx: Pick<GraphicsProfile, 'liteWeather' | 'spotlights'>) {
    const lowDetail = gfx.liteWeather;
    const look = lookFor(conditions);
    scene.background = new THREE.Color(look.sky);
    const poor = conditions.weather === 'rain' || conditions.weather === 'snow' || (conditions.weather === 'cloudy' && conditions.time !== 'sunset');
    this.fogDistance = conditions.time === 'night' ? [40, 95] : poor ? [45, 100] : [70, 130];
    scene.fog = new THREE.Fog(look.fog, this.fogDistance[0], this.fogDistance[1]);
    scene.traverse((o) => {
      if (o instanceof THREE.DirectionalLight) {
        o.color.set(look.sun);
        o.intensity = look.sunIntensity;
        o.position.set(...look.sunPos);
      } else if (o instanceof THREE.HemisphereLight) {
        o.color.set(look.hemiSky);
        o.groundColor.set(look.hemiGround);
        o.intensity = look.hemiIntensity;
      }
    });
    scene.add(this.group);

    if (conditions.time === 'night') this.buildNight(lowDetail, gfx.spotlights);
    if (conditions.time === 'sunset') this.buildSun('#ffd27a', 1.9, new THREE.Vector3(-90, 16, 20));
    if (conditions.time === 'day' && conditions.weather === 'clear') this.buildSun('#fff6c8', 2.2, new THREE.Vector3(-40, 70, 30));
    if (conditions.weather === 'cloudy' || conditions.weather === 'rain') this.buildCloudShadows(conditions.weather === 'rain' ? 10 : 6);
    if (conditions.weather === 'rain') this.buildRain(lowDetail ? 500 : 1100);
    if (conditions.weather === 'snow') this.buildSnow(lowDetail ? 400 : 900);
    if (conditions.weather === 'snow') this.dustGrass();
  }

  private buildSun(colour: string, size: number, at: THREE.Vector3): void {
    const sun = new THREE.Mesh(new THREE.CircleGeometry(size, 24), new THREE.MeshBasicMaterial({ color: colour, fog: false }));
    sun.position.copy(at);
    sun.lookAt(0, 0, 0);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(size * 2.4, 24), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, fog: false, depthWrite: false }));
    glow.position.copy(at).multiplyScalar(1.01);
    glow.lookAt(0, 0, 0);
    this.group.add(glow, sun);
  }

  private buildNight(lowDetail: boolean, spotlights: boolean): void {
    // Stars on a big sphere, far enough that fog does not touch them.
    const n = lowDetail ? 250 : 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.1;
      const r = 150;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.group.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: true, fog: false })));
    this.buildSun('#fff7d6', 1.6, new THREE.Vector3(60, 60, -70));
    // Floodlights: lamps glow and a spotlight from each tower washes the pitch.
    for (const [x, , z] of floodlightPositions(this.dims.length, this.dims.width)) {
      if (spotlights) {
        const lamp = new THREE.SpotLight(0xf3f7ff, lowDetail ? 22 : 30, 80, Math.PI / 4.2, 0.6, 1.1);
        lamp.position.set(x, 9.5, z);
        lamp.target.position.set(x * 0.15, 0, z * 0.15);
        this.group.add(lamp, lamp.target);
      }
      const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.set(x - Math.sign(x) * 1.2, 7, z - Math.sign(z) * 1.2);
      beam.lookAt(x * 0.15, 0, z * 0.15);
      beam.rotateX(Math.PI / 2);
      this.group.add(beam);
    }
    // Without the spotlights (Low graphics), brighten the existing lights instead: a flat floodlit wash costs nothing per pixel.
    if (!spotlights) this.scene.traverse((o) => {
      if (o instanceof THREE.HemisphereLight) { o.intensity += 0.9; o.color.lerp(new THREE.Color(0xf3f7ff), 0.5); }
      else if (o instanceof THREE.DirectionalLight && o.castShadow) { o.intensity += 0.9; o.color.lerp(new THREE.Color(0xf3f7ff), 0.5); }
    });
    this.scene.traverse((o) => { if (o.userData.lamp && o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.5; });
  }

  private buildCloudShadows(n: number): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: this.conditions.time === 'night' ? 0.05 : 0.11, depthWrite: false });
    for (let i = 0; i < n; i++) {
      const cloud = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const r = 2.5 + Math.random() * 4;
        const blob = new THREE.Mesh(new THREE.CircleGeometry(r, 14), mat);
        blob.rotation.x = -Math.PI / 2;
        blob.position.set((Math.random() - 0.5) * 7, 0.015, (Math.random() - 0.5) * 4);
        cloud.add(blob);
      }
      cloud.position.set((Math.random() - 0.5) * (this.dims.length + 60), 0, (Math.random() - 0.5) * (this.dims.width + 40));
      this.group.add(cloud);
      this.clouds.push(cloud as unknown as THREE.Mesh);
    }
  }

  private buildRain(n: number): void {
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) this.dropReset(pos, i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: this.conditions.time === 'night' ? 0x9fb4d8 : 0xdbe9ff, transparent: true, opacity: 0.55 }));
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.rain = { mesh, pos, n };
  }

  private dropReset(pos: Float32Array, i: number, anywhere: boolean): void {
    const x = (Math.random() - 0.5) * (this.dims.length + 30);
    const z = (Math.random() - 0.5) * (this.dims.width + 30);
    const y = anywhere ? Math.random() * 22 : 20 + Math.random() * 4;
    pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
    pos[i * 6 + 3] = x + 0.08; pos[i * 6 + 4] = y + 0.5; pos[i * 6 + 5] = z;
  }

  private buildSnow(n: number): void {
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (this.dims.length + 30);
      pos[i * 3 + 1] = Math.random() * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * (this.dims.width + 30);
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.95 }));
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.snow = { mesh, pos, phase, n };
  }

  /** A covering of snow: the grass and the surround go white (the mown stripes still show faintly), the tree tops too. */
  private dustGrass(): void {
    const snowTex = grassTexture(12, '#f1f5f8', '#e6edf2');
    const apronTex = grassTexture(1, '#e9eef2', '#e9eef2');
    apronTex.wrapS = apronTex.wrapT = THREE.RepeatWrapping;
    apronTex.repeat.set(6, 6);
    // Leaf materials are shared between trees, so whiten each one only once.
    const leaves = new Set<THREE.MeshToonMaterial>();
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mat = o.material as THREE.MeshStandardMaterial;
      if (o.userData.grass) { mat.map = o.userData.grass === 'apron' ? apronTex : snowTex; mat.needsUpdate = true; }
      if (o.userData.leaves) leaves.add(o.material as THREE.MeshToonMaterial);
    });
    for (const mat of leaves) mat.color.lerp(new THREE.Color('#e9eef2'), 0.6);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.rain) {
      const { pos, n, mesh } = this.rain;
      const fall = 16 * dt, drift = 2.5 * dt;
      for (let i = 0; i < n; i++) {
        pos[i * 6 + 1] -= fall; pos[i * 6 + 4] -= fall;
        pos[i * 6] += drift; pos[i * 6 + 3] += drift;
        if (pos[i * 6 + 1] < 0) this.dropReset(pos, i, false);
      }
      (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.snow) {
      const { pos, n, mesh, phase } = this.snow;
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] -= 1.3 * dt;
        pos[i * 3] += Math.sin(this.time * 0.9 + phase[i]) * 0.5 * dt;
        pos[i * 3 + 2] += Math.cos(this.time * 0.7 + phase[i]) * 0.4 * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 18 + Math.random() * 3; pos[i * 3] = (Math.random() - 0.5) * (this.dims.length + 30); pos[i * 3 + 2] = (Math.random() - 0.5) * (this.dims.width + 30); }
      }
      (mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    for (const c of this.clouds) {
      c.position.x += 0.9 * dt;
      if (c.position.x > this.dims.length / 2 + 30) c.position.x = -this.dims.length / 2 - 30;
    }
  }

  /** Frees the sky, rain and lamps. The snow painted on the grass goes with the pitch. */
  dispose(): void {
    this.scene.remove(this.group);
    disposeObject(this.group);
  }
}
