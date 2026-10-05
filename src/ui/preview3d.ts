import * as THREE from 'three';
import type { Build, Kit, Player } from '../data/types';
import { IDLE_STATE, PlayerModel } from '../game/PlayerModel';

/** A small spinning 3D player used by the team builder's live kit preview. */
export class KitPreview3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private model: PlayerModel;
  private raf = 0;
  private t = 0;
  private spin = 0.6;
  private dragging = false;
  private lastX = 0;

  constructor(private canvas: HTMLCanvasElement, player: Player, kit: Kit, private scale: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.dragging) { this.t += (e.clientX - this.lastX) * 0.01; this.lastX = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.dragging = false; });
    this.resize();
    this.frame(0);
  }

  setKit(kit: Kit, number: number): void { this.model.setKit(kit, number); }
  setLook(skin: string, hair: string, hairStyle?: Player["hairStyle"], boots?: string): void { this.model.setLook(skin, hair, hairStyle, boots); }
  setBuild(build: Build): void { this.model.setBuild(build); }
  setScale(scale: number): void { this.scale = scale; this.model.group.scale.setScalar(1); }

  private resize(): void {
    const w = this.canvas.clientWidth || 240, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private last = 0;
  private frame = (now: number): void => {
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
    this.model.dispose();
    this.renderer.dispose();
  }
}
