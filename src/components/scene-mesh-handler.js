/**
 * Composant scene-mesh-handler pour A-Frame
 * Detection de surfaces WebXR (Hit Test API) avec fallback mock
 */

import { safeRemove, toVec3, toQuat } from '../utils.js';

const MOCK_SURFACES = [
  { position: '2 1.5 -3', rotation: '0 90 0', width: 2, height: 2, label: 'Mur droit' },
  { position: '-2 1.5 -3', rotation: '0 -90 0', width: 2, height: 2, label: 'Mur gauche' },
  { position: '0 0 -5', rotation: '-90 0 0', width: 4, height: 4, label: 'Sol virtuel' },
];

AFRAME.registerComponent('scene-mesh-handler', {
  init() {
    this.sceneMeshes = [];
    this.spawnSurfaces = [];
    this.isWebXRSupported = false;
    this.xrSession = null;
    this.xrRefSpace = null;
    this.hitTestSource = null;
    this.detectedSurfaces = [];
    this.lastResultTime = 0;
    this.hasHitTestThisFrame = false;
    this.usesMockSurfaces = false;

    if ('xr' in navigator) {
      this.checkWebXRSupport();
    } else {
      console.log('\u26a0\ufe0f WebXR non disponible sur ce navigateur');
    }
  },

  async checkWebXRSupport() {
    try {
      const isARSupported = await navigator.xr?.isSessionSupported('immersive-ar');
      const isVRSupported = await navigator.xr?.isSessionSupported('immersive-vr');
      this.isWebXRSupported = isARSupported || isVRSupported;

      if (this.isWebXRSupported) {
        console.log(`\u2705 WebXR support\u00e9 - AR: ${isARSupported}, VR: ${isVRSupported}`);
        this.setupSceneMeshTracking();
      } else {
        console.log('\u26a0\ufe0f WebXR non support\u00e9 sur cet appareil');
      }
    } catch (error) {
      console.log('\u26a0\ufe0f Erreur de v\u00e9rification WebXR:', error);
    }
  },

  setupSceneMeshTracking() {
    const { sceneEl } = this.el;
    sceneEl.addEventListener('enter-vr', () => {
      console.log('\ud83e\udd7d Entr\u00e9e en mode VR - Activation du Scene Mesh');
      this.startSceneMeshDetection();
    });
    sceneEl.addEventListener('exit-vr', () => {
      console.log('\ud83d\udc4b Sortie du mode VR - D\u00e9sactivation du Scene Mesh');
      this.stopSceneMeshDetection();
    });
  },

  startSceneMeshDetection() {
    const { renderer } = this.el.sceneEl;
    this.xrSession = renderer.xr.getSession();
    this.xrRefSpace = renderer.xr.getReferenceSpace();

    if (!this.xrSession) {
      console.warn('\u26a0\ufe0f Session XR non disponible');
      return;
    }

    this.el.sceneEl.emit('scene-mesh-handler-ready', {});

    if (this.xrSession.requestHitTestSource) {
      this.initializeHitTest();
    } else {
      this.trackSceneMeshes();
    }
  },

  async initializeHitTest() {
    try {
      const viewerSpace = await this.xrSession.requestReferenceSpace('viewer');
      this.hitTestSource = await this.xrSession.requestHitTestSource({ space: viewerSpace });
      console.log('\ud83c\udfaf Hit-test initialis\u00e9 (viewer space)');
    } catch (error) {
      console.warn('\u26a0\ufe0f Hit-test viewer impossible, fallback local', error);
      try {
        const localSpace = await this.xrSession.requestReferenceSpace('local');
        this.hitTestSource = await this.xrSession.requestHitTestSource({ space: localSpace });
        console.log('\ud83c\udfaf Hit-test initialis\u00e9 (local space)');
      } catch (err) {
        console.warn('\u26a0\ufe0f Hit-test indisponible, fallback mock', err);
        this.trackSceneMeshes();
      }
    }
  },

  trackSceneMeshes() {
    if (this.hitTestSource) return;
    console.log('\u26a0\ufe0f Hit-test indisponible - Utilisation de surfaces mock\u00e9es');
    this.usesMockSurfaces = true;
    this.createMockSceneMesh();
  },

  createMockSceneMesh() {
    const { sceneEl } = this.el;

    MOCK_SURFACES.forEach(({ position, rotation, width, height, label }, index) => {
      const meshEntity = document.createElement('a-plane');
      meshEntity.setAttribute('position', position);
      meshEntity.setAttribute('rotation', rotation);
      meshEntity.setAttribute('width', width);
      meshEntity.setAttribute('height', height);
      meshEntity.setAttribute('material', { color: '#4CC3D9', opacity: 0.3, transparent: true, wireframe: true });
      meshEntity.setAttribute('static-body', { shape: 'box' });
      meshEntity.setAttribute('class', 'scene-mesh spawn-surface');
      meshEntity.id = `scene-mesh-${index}`;

      sceneEl.appendChild(meshEntity);
      this.sceneMeshes.push(meshEntity);
      this.spawnSurfaces.push(meshEntity);
      console.log(`\u2705 Surface d\u00e9tect\u00e9e ajout\u00e9e: ${label}`);
    });

    this.emitSceneMeshUpdate();
  },

  tick() {
    this.hasHitTestThisFrame = false;
    if (!this.xrSession || !this.hitTestSource) return;

    const frame = this.el.sceneEl.frame;
    if (!frame) return;

    try {
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);
      if (!hitTestResults?.length) return;

      const pose = hitTestResults[0].getPose(this.xrRefSpace);
      if (!pose) return;

      const { position: pos, orientation: quat } = pose.transform;
      const position = toVec3(pos);
      const quaternion = toQuat(quat);
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();

      const surface = { position, quaternion, normal, width: 1, height: 1, stability: 1 };
      this.detectedSurfaces.unshift(surface);
      if (this.detectedSurfaces.length > 3) this.detectedSurfaces.pop();

      this.hasHitTestThisFrame = true;
      this.lastResultTime = Date.now();

      this.el.sceneEl.emit('surface-detected', {
        position, normal, quaternion, stability: 1,
        isFloor: normal.y > 0.7,
        isWall: Math.abs(normal.y) < 0.4,
        isCeiling: normal.y < -0.7,
      });
    } catch (error) {
      console.warn('\u26a0\ufe0f Hit-test error:', error.message);
    }
  },

  emitSceneMeshUpdate() {
    this.el.sceneEl.emit('scene-mesh-updated', { surfaces: this.spawnSurfaces.slice() });
  },

  getDetectedSurface() {
    if (!this.detectedSurfaces.length) return null;

    const { position, quaternion, normal } = this.detectedSurfaces[0];
    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    return {
      position,
      rotation: {
        x: THREE.MathUtils.radToDeg(euler.x),
        y: THREE.MathUtils.radToDeg(euler.y),
        z: THREE.MathUtils.radToDeg(euler.z),
      },
      normal,
      type: Math.abs(normal.y) > 0.7 ? 'horizontal' : 'vertical',
      isRealSurface: true,
    };
  },

  isHitTestActive() {
    if (!this.xrSession || !this.hitTestSource) return false;
    if (this.hasHitTestThisFrame) return true;
    if (!this.lastResultTime) return false;
    return Date.now() - this.lastResultTime < 30000;
  },

  async createAnchor(pose) {
    if (!this.xrSession) return null;

    return new Promise((resolve) => {
      this.xrSession.requestAnimationFrame(async (time, frame) => {
        if (!frame?.createAnchor) { resolve(null); return; }
        try {
          const anchor = await frame.createAnchor(pose, this.xrRefSpace);
          resolve(anchor || null);
        } catch { resolve(null); }
      });
    });
  },

  deleteAnchor(anchor) {
    if (typeof anchor?.delete === 'function') anchor.delete();
  },

  stopSceneMeshDetection() {
    this.sceneMeshes.forEach((mesh) => safeRemove(mesh));
    this.sceneMeshes = [];
    this.spawnSurfaces = [];
    this.hitTestSource = null;
    this.xrSession = null;
    this.xrRefSpace = null;
    this.detectedSurfaces = [];
  },

  remove() {
    this.stopSceneMeshDetection();
  },
});
