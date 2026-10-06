import * as THREE from 'three';
import type { BootStyle, Build, Kit, Player } from '../data/types';
import { IDLE_STATE, PlayerModel } from '../game/PlayerModel';

/**
 * One renderer for every preview the builder ever shows. The builder redraws itself on most taps,
 * and a new WebGL context each time soon has the browser dropping the oldest one (which can be the
 * match's). The renderer brings its own canvas, which each preview puts where the screen's one was.
 */
let shared: THREE.WebGLRenderer | null = null;
/** The preview drawing with it now; one that is still running stops once a newer one takes over. */
let current: KitPreview3D | null = null;

/** The shared renderer, made again (with a new canvas) if its context was lost; null if WebGL will not start at all. */
function previewRenderer(): THREE.WebGLRenderer | null {
  if (shared && !shared.getContext().isContextLost()) return shared;
  try { shared?.dispose(); } catch { /* nothing left to free on a lost context */ }
  shared = null;
  try {
    shared = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  shared.outputColorSpace = THREE.SRGBColorSpace;
  return shared;
}

/** Put the renderer's canvas in place of the screen's, wearing its id, classes and size. */
function adopt(placeholder: HTMLCanvasElement, canvas: HTMLCanvasElement): HTMLCanvasElement {
  if (placeholder === canvas) return canvas;
  for (const a of [...canvas.attributes]) if (a.name !== 'data-engine') canvas.removeAttribute(a.name);
  for (const a of [...placeholder.attributes]) canvas.setAttribute(a.name, a.value);
  placeholder.replaceWith(canvas);
  return canvas;
}

/** A small spinning 3D player used by the team builder's live kit preview. Without WebGL the box just stays empty. */
export class KitPreview3D {
  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly canvas: HTMLCanvasElement;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private model: PlayerModel;
  private raf = 0;
  private t = 0;
  private spin = 0.6;
  private dragging = false;
  private lastX = 0;

  /** `placeholder` is the screen's canvas: the shared renderer's canvas takes its place. */
  constructor(placeholder: HTMLCanvasElement, player: Player, kit: Kit, private scale: number) {
    this.renderer = previewRenderer();
    this.canvas = this.renderer ? adopt(placeholder, this.renderer.domElement) : placeholder;
    this.renderer?.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f71, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshStandardMaterial({ color: 0x2eb872 }));
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);
    this.model = new PlayerModel(player, kit, scale);
    this.scene.add(this.model.group);
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerup', this.onUp);
    current = this;
    this.resize();
    this.frame(0);
  }

  // Kept as fields so dispose() can take them off the shared canvas again.
  private readonly onDown = (e: PointerEvent): void => { this.dragging = true; this.lastX = e.clientX; this.canvas.setPointerCapture(e.pointerId); };
  private readonly onMove = (e: PointerEvent): void => { if (this.dragging) { this.t += (e.clientX - this.lastX) * 0.01; this.lastX = e.clientX; } };
  private readonly onUp = (): void => { this.dragging = false; };

  setKit(kit: Kit, number: number): void { this.model.setKit(kit, number); }
  setLook(skin: string, hair: string, hairStyle?: Player["hairStyle"], boots?: string, bootStyle?: BootStyle): void { this.model.setLook(skin, hair, hairStyle, boots, bootStyle); }
  setBuild(build: Build): void { this.model.setBuild(build); }
  setScale(scale: number): void { this.scale = scale; this.model.group.scale.setScalar(1); }

  private resize(): void {
    const w = this.canvas.clientWidth || 240, h = this.canvas.clientHeight || 300;
    this.renderer?.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private last = 0;
  private frame = (now: number): void => {
    if (current !== this || !this.renderer) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.dragging) this.t += this.spin * dt;
    this.model.setFacing(-this.t + Math.PI / 2);
    // A happy little wave of the eyes every so often keeps the preview alive.
    const mood = Math.sin(this.t * 0.7) > 0.93 ? 'happy' : 'neutral';
    this.model.animate(dt, { ...IDLE_STATE, scale: this.scale, mood, gazeX: Math.round(Math.sin(this.t * 1.3) * 2) / 2 });
    const h = 1.6 * this.scale * 1.35;
    this.camera.position.set(0, h * 0.75, h * 2.4);
    this.camera.lookAt(0, h * 0.5, 0);
    if (this.canvas.clientWidth && (this.canvas.width !== Math.floor(this.canvas.clientWidth * this.renderer.getPixelRatio()))) this.resize();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    if (current === this) current = null;
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.model.dispose();
    // The renderer stays for the next preview: it only lets go of this one's draw lists.
    this.renderer?.renderLists.dispose();
  }
}
