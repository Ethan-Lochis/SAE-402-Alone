/**
 * Composant webxr-anchor-manager pour A-Frame
 * Gestion du cycle de vie des anchors WebXR
 */

import { clearTimer } from '../utils.js';

AFRAME.registerComponent('webxr-anchor-manager', {
  schema: {
    maxAnchors: { type: 'number', default: 30 },
    autoCleanup: { type: 'boolean', default: true },
    cleanupInterval: { type: 'number', default: 5000 },
  },

  init() {
    this.anchors = new Map();
    this.anchoredEntities = new Map();
    this.sceneMeshHandler = null;
    this.cleanupTimer = null;

    const { sceneEl } = this.el;
    sceneEl.addEventListener('enter-vr', () => this.onEnterVR());
    sceneEl.addEventListener('exit-vr', () => this.onExitVR());

    console.log('⚓ Anchor Manager initialisé');
  },

  onEnterVR() {
    const { sceneEl } = this.el;
    const sceneMeshEntity = sceneEl.querySelector('[scene-mesh-handler]');
    this.sceneMeshHandler = sceneMeshEntity?.components['scene-mesh-handler'] ?? null;

    if (this.sceneMeshHandler) {
      console.log('✅ Anchor Manager connecté au Scene Mesh Handler');
    }

    if (this.data.autoCleanup) this.startAutoCleanup();
    sceneEl.emit('anchor-manager-ready');
  },

  onExitVR() {
    this.cleanup();
    this.cleanupTimer = clearTimer(this.cleanupTimer, 'interval');
    console.log('👋 Anchor Manager nettoyé');
  },

  async createAnchor(pose) {
    if (!this.sceneMeshHandler) return null;

    if (this.anchors.size >= this.data.maxAnchors) {
      const firstKey = this.anchors.keys().next().value;
      this.deleteAnchor(firstKey);
    }

    let xrPose = pose;
    if (pose?.position && pose?.quaternion) {
      const { position: p, quaternion: q } = pose;
      xrPose = new XRRigidTransform(
        { x: p.x, y: p.y, z: p.z },
        { x: q.x, y: q.y, z: q.z, w: q.w },
      );
    }

    const anchor = await this.sceneMeshHandler.createAnchor(xrPose);
    if (!anchor) return null;

    const anchorId = `anchor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    anchor.id = anchorId;
    this.anchors.set(anchorId, anchor);

    const { position, quaternion } = pose;
    this.el.sceneEl.emit('anchor-created', { anchorId, position, quaternion });
    return anchorId;
  },

  attachToAnchor(entity, anchorId) {
    if (!this.anchors.has(anchorId)) return false;

    const entityId = entity.id || `entity-${Date.now()}`;
    entity.id = entityId;
    entity.setAttribute('data-anchor-id', anchorId);
    this.anchoredEntities.set(entityId, anchorId);

    const anchor = this.anchors.get(anchorId);
    if (anchor) this.updateEntityFromAnchor(entity, anchor);
    return true;
  },

  updateEntityFromAnchor(entity, anchor) {
    if (!anchor?.anchorSpace) return false;

    const frame = this.el.sceneEl.frame;
    if (!frame) return false;

    const xrRefSpace = this.el.sceneEl.renderer?.xr?.getReferenceSpace();
    if (!xrRefSpace) return false;

    const anchorPose = frame.getPose(anchor.anchorSpace, xrRefSpace);
    if (!anchorPose) return false;

    const { position: pos, orientation: quat } = anchorPose.transform;
    entity.object3D.position.set(pos.x, pos.y, pos.z);
    entity.object3D.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    return true;
  },

  deleteAnchor(anchorId) {
    const anchor = this.anchors.get(anchorId);
    if (!anchor) return false;

    this.sceneMeshHandler?.deleteAnchor(anchor);
    this.anchors.delete(anchorId);

    for (const [entityId, aId] of this.anchoredEntities.entries()) {
      if (aId === anchorId) {
        document.getElementById(entityId)?.removeAttribute('data-anchor-id');
        this.anchoredEntities.delete(entityId);
      }
    }
    return true;
  },

  startAutoCleanup() {
    this.cleanupTimer = setInterval(() => {
      for (const [entityId] of this.anchoredEntities.entries()) {
        if (!document.getElementById(entityId)) this.anchoredEntities.delete(entityId);
      }
    }, this.data.cleanupInterval);
  },

  cleanup() {
    for (const [anchorId, anchor] of this.anchors.entries()) {
      this.sceneMeshHandler?.deleteAnchor(anchor);
      this.anchors.delete(anchorId);
    }
    this.anchoredEntities.clear();
  },

  tick() {
    if (!this.sceneMeshHandler || this.anchoredEntities.size === 0) return;

    const { frame } = this.el.sceneEl;
    if (!frame) return;

    for (const [entityId, anchorId] of this.anchoredEntities.entries()) {
      const entity = document.getElementById(entityId);
      const anchor = this.anchors.get(anchorId);
      if (!entity || !anchor) continue;
      this.updateEntityFromAnchor(entity, anchor);
    }
  },
});
