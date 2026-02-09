/**
 * Composant surface-detector pour A-Frame
 * Détecte les surfaces (horizontales/verticales) pour le spawn de cibles
 * Priorise les surfaces réelles issues du hit-test
 */

import { clearTimer } from '../utils.js';

// Module-level reused THREE objects (perf: avoid allocations in hot paths)
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _normal = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _perpendicular = new THREE.Vector3();
const _tempObj = new THREE.Object3D();
const _defaultUp = new THREE.Vector3(0, 1, 0);
const _defaultForward = new THREE.Vector3(0, 0, 1);
const _negZ = new THREE.Vector3(0, 0, -1);

const STABILITY_EXPIRY_MS = 3000;

AFRAME.registerComponent('surface-detector', {
  schema: {
    enabled: { type: 'boolean', default: true },
    debugMode: { type: 'boolean', default: false },
    defaultTargetHeight: { type: 'number', default: 0.5 },
    maxDistance: { type: 'number', default: 10 },
    minSurfaceArea: { type: 'number', default: 0.25 },
    stabilityFrames: { type: 'number', default: 3 },
    allowFallback: { type: 'boolean', default: false },
    visualizeSurfaces: { type: 'boolean', default: false },
  },

  init() {
    this.surfaces = { horizontal: [], vertical: [] };
    this.surfaceHistory = new Map();
    this.realSurfaceMap = new Map();
    this.realSurfacesEnabled = false;
    this.pendingDetect = null;

    const { sceneEl } = this.el;

    sceneEl.addEventListener('surface-detected', (evt) => {
      this.onRealSurfaceDetected(evt.detail);
    });

    sceneEl.addEventListener('scene-mesh-handler-ready', () => {
      this.realSurfacesEnabled = true;
    });

    if (sceneEl.hasLoaded) {
      this.initializeSurfaceDetection();
    } else {
      sceneEl.addEventListener('loaded', () => {
        this.initializeSurfaceDetection();
      });
    }

    console.log('🔍 Surface Detector initialisé');
  },

  initializeSurfaceDetection() {
    this.detectSurfaces();
  },

  onRealSurfaceDetected(surfaceData) {
    if (!this.data.enabled || !surfaceData) return;

    const key = this.getSurfaceKey(surfaceData.position);
    const position = new THREE.Vector3(surfaceData.position.x, surfaceData.position.y, surfaceData.position.z);
    const quaternion = new THREE.Quaternion(surfaceData.quaternion.x, surfaceData.quaternion.y, surfaceData.quaternion.z, surfaceData.quaternion.w);
    const normal = new THREE.Vector3(surfaceData.normal.x, surfaceData.normal.y, surfaceData.normal.z).normalize();

    const surface = {
      position, quaternion, normal,
      width: surfaceData.width || 1,
      height: surfaceData.height || 1,
      isRealSurface: true,
      stability: surfaceData.stability || 1,
    };

    this.realSurfaceMap.set(key, surface);
    this.updateSurfaceStability(key, surface);

    if (!this.pendingDetect) {
      this.pendingDetect = setTimeout(() => {
        this.detectSurfaces();
        this.pendingDetect = null;
      }, 100);
    }
  },

  detectSurfaces() {
    if (!this.data.enabled) return;

    this.surfaces.horizontal = [];
    this.surfaces.vertical = [];

    let realCount = 0;

    if (this.realSurfacesEnabled && this.realSurfaceMap.size > 0) {
      for (const surface of this.realSurfaceMap.values()) {
        const classified = this.classifySurface(surface);
        if (classified) {
          this.surfaces[classified.type].push(classified);
          realCount++;
        }
      }
    }

    if (this.data.allowFallback) {
      this.el.sceneEl.object3D.traverse((object) => {
        const el = object.el;
        if (!el?.getAttribute || !el.classList.contains('scene-mesh')) return;

        const geometry = el.getAttribute('geometry') || {};
        const width = el.getAttribute('width') || geometry.width || 1;
        const height = el.getAttribute('height') || geometry.height || 1;

        el.object3D.getWorldPosition(_worldPos);
        el.object3D.getWorldQuaternion(_worldQuat);
        _normal.copy(_defaultForward).applyQuaternion(_worldQuat).normalize();

        const surface = {
          position: _worldPos.clone(),
          quaternion: _worldQuat.clone(),
          normal: _normal.clone(),
          width, height,
          isRealSurface: false,
          stability: 0,
        };

        const classified = this.classifySurface(surface);
        if (classified) this.surfaces[classified.type].push(classified);
      });
    }

    const { horizontal, vertical } = this.surfaces;
    this.el.sceneEl.emit('surfaces-detected', {
      horizontal: horizontal.length,
      vertical: vertical.length,
      real: realCount,
      hitTest: realCount,
      mesh: 0,
      mock: horizontal.length + vertical.length - realCount,
    });
  },

  classifySurface(surface) {
    _normal.copy(surface.normal).normalize();
    const type = Math.abs(_normal.y) > 0.7 ? 'horizontal' : 'vertical';

    const camera = this.el.sceneEl.camera;
    const cameraPos = camera
      ? camera.getWorldPosition(_cameraPos)
      : _cameraPos.set(0, 1.6, 0);

    if (!this.validateSurface(surface, cameraPos)) return null;

    return {
      ...surface,
      type,
      outwardNormal: _normal.clone(),
      worldPosition: surface.position,
      worldQuaternion: surface.quaternion,
    };
  },

  validateSurface(surface, cameraPos) {
    const { maxDistance, minSurfaceArea, stabilityFrames } = this.data;

    if (cameraPos.distanceTo(surface.position) > maxDistance) return false;

    const area = (surface.width || 1) * (surface.height || 1);
    if (area < minSurfaceArea) return false;

    if (surface.isRealSurface) {
      const key = this.getSurfaceKey(surface.position);
      if (this.getSurfaceStability(key) < stabilityFrames) return false;
    }

    return true;
  },

  updateSurfaceStability(key, surface) {
    const now = Date.now();
    const existing = this.surfaceHistory.get(key);

    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      existing.surface = surface;
    } else {
      this.surfaceHistory.set(key, { count: 1, lastSeen: now, surface });
    }

    // Purge expired entries
    for (const [k, entry] of this.surfaceHistory) {
      if (now - entry.lastSeen > STABILITY_EXPIRY_MS) this.surfaceHistory.delete(k);
    }
  },

  getSurfaceStability(key) {
    return this.surfaceHistory.get(key)?.count ?? 0;
  },

  getSurfaceKey(position) {
    return `${Math.round(position.x * 10)}-${Math.round(position.y * 10)}-${Math.round(position.z * 10)}`;
  },

  getRandomSpawnPoint() {
    const { horizontal, vertical } = this.surfaces;
    const total = horizontal.length + vertical.length;
    if (total === 0) return null;

    return Math.random() < horizontal.length / total
      ? this.getRandomHorizontalSpawnPoint()
      : this.getRandomVerticalSpawnPoint();
  },

  getRandomHorizontalSpawnPoint() {
    const { horizontal } = this.surfaces;
    if (horizontal.length === 0) return null;

    const surface = horizontal[0];
    const normal = surface.outwardNormal || _defaultUp.clone();
    const position = surface.position.clone();

    position.x += (Math.random() - 0.5) * (surface.width || 2) * 0.6;
    position.z += (Math.random() - 0.5) * (surface.height || 2) * 0.6;

    const isCeiling = normal.y < -0.5;
    if (isCeiling) {
      position.addScaledVector(normal, 0.5);
    } else {
      position.y += this.data.defaultTargetHeight;
    }

    const camera = this.el.sceneEl.camera;
    const cameraPos = camera ? camera.getWorldPosition(_cameraPos) : _cameraPos.set(0, 1.6, 0);

    _tempObj.position.copy(position);
    _tempObj.lookAt(cameraPos);

    return {
      position,
      rotation: { x: 0, y: THREE.MathUtils.radToDeg(_tempObj.rotation.y), z: 0 },
      surfaceType: 'horizontal',
      isRealSurface: surface.isRealSurface ?? false,
      stability: surface.stability ?? 0,
      normal,
    };
  },

  getRandomVerticalSpawnPoint() {
    const { vertical } = this.surfaces;
    if (vertical.length === 0) return null;

    const surface = vertical[0];
    const normal = surface.outwardNormal || _defaultForward.clone();
    const position = surface.position.clone();

    const offsetY = (Math.random() - 0.5) * (surface.height || 2) * 0.6;
    const offsetX = (Math.random() - 0.5) * (surface.width || 2) * 0.6;

    _perpendicular.set(-normal.z, 0, normal.x).normalize();
    position.addScaledVector(_perpendicular, offsetX);
    position.y += offsetY;
    position.addScaledVector(normal, 0.2);

    const qAlign = new THREE.Quaternion().setFromUnitVectors(_negZ, _normal.copy(normal).normalize());
    const eAlign = new THREE.Euler().setFromQuaternion(qAlign, 'XYZ');

    return {
      position,
      rotation: {
        x: THREE.MathUtils.radToDeg(eAlign.x),
        y: THREE.MathUtils.radToDeg(eAlign.y),
        z: THREE.MathUtils.radToDeg(eAlign.z),
      },
      surfaceType: 'vertical',
      isRealSurface: surface.isRealSurface ?? false,
      stability: surface.stability ?? 0,
      normal,
    };
  },
});
