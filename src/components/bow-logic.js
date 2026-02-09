/**
 * Composant bow-logic - Laser de visee & tir simple (desktop/VR fallback)
 * Cree un aimGuide pour corriger la direction de visee, affiche un laser,
 * raycaster pour detecter les cibles, tir via trigger/clic souris.
 */

import { playSound, disposeThreeObject } from '../utils.js';

/* Vecteurs reutilises pour eviter les allocations dans tick() */
const _origin = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();

AFRAME.registerComponent('bow-logic', {
  schema: {
    arrowSpeed: { type: 'number', default: 45 },
    color: { type: 'color', default: '#00ff00' },
    hitColor: { type: 'color', default: '#ff0000' },
  },

  init() {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.near = 0.1;

    this.tempVector = new THREE.Vector3();
    this.tempQuaternion = new THREE.Quaternion();

    this.aimGuide = new THREE.Object3D();
    this.el.object3D.add(this.aimGuide);

    this.createLaserBeam();

    this.onTriggerDown = () => this.shootArrow();
    this.el.addEventListener('triggerdown', this.onTriggerDown);
    this.el.addEventListener('abuttondown', this.onTriggerDown);

    this.onMouseClick = () => this.shootArrowMouse();
    document.addEventListener('click', this.onMouseClick);

    console.log('🏹 Arc initialisé avec guide de visée');
  },

  createLaserBeam() {
    const { color, hitColor } = this.data;

    const geometry = new THREE.CylinderGeometry(0.003, 0.003, 1, 8);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -0.5);

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });

    this.laserMesh = new THREE.Mesh(geometry, material);
    this.aimGuide.add(this.laserMesh);

    const dotGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: hitColor });
    this.cursorMesh = new THREE.Mesh(dotGeo, dotMat);
    this.cursorMesh.visible = false;
    this.el.sceneEl.object3D.add(this.cursorMesh);
  },

  tick() {
    if (!this.laserMesh || !this.aimGuide) return;

    this.aimGuide.getWorldPosition(_origin);
    this.aimGuide.getWorldQuaternion(_worldQuat);
    _direction.set(0, 0, -1).applyQuaternion(_worldQuat);

    this.raycaster.set(_origin, _direction);

    const targetObjects = Array.from(
      this.el.sceneEl.querySelectorAll('[target-behavior]'),
    ).map((el) => el.object3D);

    let distance = 50;
    let hittingTarget = false;

    if (targetObjects.length > 0) {
      const intersects = this.raycaster.intersectObjects(targetObjects, true);
      if (intersects.length > 0) {
        distance = intersects[0].distance;
        hittingTarget = true;
        this.cursorMesh.position.copy(intersects[0].point);
        this.cursorMesh.visible = true;
      } else {
        this.cursorMesh.visible = false;
      }
    } else {
      this.cursorMesh.visible = false;
    }

    this.laserMesh.scale.z = distance;

    const { color, hitColor } = this.data;
    if (hittingTarget) {
      this.laserMesh.material.color.set(hitColor);
      this.laserMesh.material.opacity = 0.8;
    } else {
      this.laserMesh.material.color.set(color);
      this.laserMesh.material.opacity = 0.4;
    }
  },

  shootArrow() {
    if (!this.aimGuide) return;

    playSound('shoot-sound');

    this.aimGuide.getWorldPosition(this.tempVector);
    this.aimGuide.getWorldQuaternion(this.tempQuaternion);

    this.createFlyingArrow(this.tempVector, this.tempQuaternion);
  },

  shootArrowMouse() {
    if (!this.el.sceneEl.is('vr-mode')) {
      this.shootArrow();
    }
  },

  createFlyingArrow(position, rotation) {
    const scene = this.el.sceneEl;
    const arrow = document.createElement('a-entity');

    arrow.setAttribute('gltf-model', 'fleche.glb');
    arrow.setAttribute('position', position);
    arrow.object3D.quaternion.copy(rotation);
    arrow.setAttribute('arrow-physics', `speed: ${this.data.arrowSpeed}`);

    scene.appendChild(arrow);
    scene.emit('arrow-shot');
  },

  remove() {
    document.removeEventListener('click', this.onMouseClick);
    this.el.removeEventListener('triggerdown', this.onTriggerDown);
    this.el.removeEventListener('abuttondown', this.onTriggerDown);

    if (this.laserMesh) {
      this.aimGuide?.remove(this.laserMesh);
    }

    disposeThreeObject(this.cursorMesh, this.el.sceneEl?.object3D);
  },
});
