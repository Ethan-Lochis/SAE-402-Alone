/**
 * Composant bow-draw-system - Mecanique VR de bandage d'arc
 * Coordonne les deux mains pour bander et tirer des fleches
 * Snap distance, puissance proportionnelle, indicateur visuel
 */

import { playSound, disposeThreeObject } from '../utils.js';

/* Vecteurs reutilises pour eviter les allocations dans tick() */
const _leftPos = new THREE.Vector3();
const _rightPos = new THREE.Vector3();
const _color = new THREE.Color();

/* Quaternion/Euler de compensation reutilises (constantes) */
const _compensationQuat = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(THREE.MathUtils.degToRad(-90), 0, 0, 'XYZ'),
);
const _aimDir = new THREE.Vector3();
const _aimQuat = new THREE.Quaternion();

AFRAME.registerComponent('bow-draw-system', {
  schema: {
    maxArrowSpeed: { type: 'number', default: 80 },
    minArrowSpeed: { type: 'number', default: 8 },
    maxDrawDistance: { type: 'number', default: 0.45 },
    minDrawDistance: { type: 'number', default: 0.12 },
    snapDistance: { type: 'number', default: 0.2 },
  },

  init() {
    this.leftHand = null;
    this.rightHand = null;

    this.isDrawing = false;
    this.drawDistance = 0;
    this.triggerPressed = false;

    this.createDrawIndicator();

    console.log('🏹 Bow Draw System initialisé');
  },

  play() {
    this.leftHand = document.querySelector('#leftHand');
    this.rightHand = document.querySelector('#rightHand');

    if (!this.leftHand || !this.rightHand) {
      console.warn('⚠️ Mains non trouvées, retry...');
      setTimeout(() => this.play(), 500);
      return;
    }

    this.onTriggerDown = () => this.handleTriggerDown();
    this.onTriggerUp = () => this.handleTriggerUp();

    this.rightHand.addEventListener('triggerdown', this.onTriggerDown);
    this.rightHand.addEventListener('triggerup', this.onTriggerUp);
    this.rightHand.addEventListener('abuttondown', this.onTriggerDown);
    this.rightHand.addEventListener('abuttonup', this.onTriggerUp);

    console.log('✅ Events attachés aux mains');
  },

  createDrawIndicator() {
    const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 3,
      transparent: true,
      opacity: 0.8,
    });

    this.drawLine = new THREE.Line(geometry, material);
    this.drawLine.visible = false;
    this.el.sceneEl.object3D.add(this.drawLine);

    const sphereGeo = new THREE.SphereGeometry(0.03, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.6,
    });
    this.handIndicator = new THREE.Mesh(sphereGeo, sphereMat);
    this.handIndicator.visible = false;
    this.el.sceneEl.object3D.add(this.handIndicator);
  },

  handleTriggerDown() {
    if (!this.leftHand || !this.rightHand) return;

    this.triggerPressed = true;

    this.leftHand.object3D.getWorldPosition(_leftPos);
    this.rightHand.object3D.getWorldPosition(_rightPos);

    const distance = _leftPos.distanceTo(_rightPos);

    if (distance < this.data.snapDistance) {
      this.isDrawing = true;
      this.drawLine.visible = true;
      this.handIndicator.visible = true;
      console.log('🎯 Corde accrochée !');

      playSound('bow-creak-sound');
    } else {
      console.log(
        `❌ Trop loin pour accrocher (${distance.toFixed(2)}m > ${this.data.snapDistance}m)`,
      );
    }
  },

  handleTriggerUp() {
    this.triggerPressed = false;

    if (this.isDrawing) {
      this.shootArrow();
      this.isDrawing = false;
      this.drawLine.visible = false;
      this.handIndicator.visible = false;
    }
  },

  tick() {
    if (!this.isDrawing || !this.leftHand || !this.rightHand) return;

    this.leftHand.object3D.getWorldPosition(_leftPos);
    this.rightHand.object3D.getWorldPosition(_rightPos);

    this.drawDistance = _leftPos.distanceTo(_rightPos);

    const positions = this.drawLine.geometry.attributes.position.array;
    positions[0] = _leftPos.x;
    positions[1] = _leftPos.y;
    positions[2] = _leftPos.z;
    positions[3] = _rightPos.x;
    positions[4] = _rightPos.y;
    positions[5] = _rightPos.z;
    this.drawLine.geometry.attributes.position.needsUpdate = true;

    this.handIndicator.position.copy(_rightPos);

    const drawRatio = Math.min(
      this.drawDistance / this.data.maxDrawDistance,
      1,
    );
    _color.setHSL(0.3 - drawRatio * 0.3, 1.0, 0.5);
    this.drawLine.material.color.copy(_color);
    this.handIndicator.material.color.copy(_color);
  },

  shootArrow() {
    if (this.drawDistance < this.data.minDrawDistance) {
      console.log('⚠️ Pas assez tiré !');
      return;
    }

    const { minArrowSpeed, maxArrowSpeed, maxDrawDistance } = this.data;
    const drawRatio = Math.min(this.drawDistance / maxDrawDistance, 1);
    const arrowSpeed = minArrowSpeed + (maxArrowSpeed - minArrowSpeed) * drawRatio;

    this.leftHand.object3D.getWorldPosition(_leftPos);
    this.leftHand.object3D.getWorldQuaternion(_aimQuat);

    _aimQuat.multiply(_compensationQuat);

    _aimDir.set(0, 0, -1).applyQuaternion(_aimQuat);

    console.log(
      `🏹 TIRE ! Distance: ${this.drawDistance.toFixed(2)}m, Puissance: ${(drawRatio * 100).toFixed(0)}%, Vitesse: ${arrowSpeed.toFixed(1)}`,
    );
    console.log('🎯 Direction visée:', {
      x: _aimDir.x.toFixed(2),
      y: _aimDir.y.toFixed(2),
      z: _aimDir.z.toFixed(2),
    });

    playSound('shoot-sound');
    playSound('arrow-fly-sound');

    this.createFlyingArrow(_leftPos, _aimQuat, arrowSpeed);

    this.el.sceneEl.emit('arrow-shot');
  },

  createFlyingArrow(position, rotation, speed) {
    const arrow = document.createElement('a-entity');

    arrow.setAttribute('gltf-model', 'fleche.glb');
    arrow.setAttribute('position', position);
    arrow.object3D.quaternion.copy(rotation);
    arrow.setAttribute('arrow-physics', `speed: ${speed}`);

    this.el.sceneEl.appendChild(arrow);
  },

  remove() {
    if (this.rightHand) {
      this.rightHand.removeEventListener('triggerdown', this.onTriggerDown);
      this.rightHand.removeEventListener('triggerup', this.onTriggerUp);
      this.rightHand.removeEventListener('abuttondown', this.onTriggerDown);
      this.rightHand.removeEventListener('abuttonup', this.onTriggerUp);
    }

    const sceneObj = this.el.sceneEl?.object3D;
    disposeThreeObject(this.drawLine, sceneObj);
    disposeThreeObject(this.handIndicator, sceneObj);
  },
});
