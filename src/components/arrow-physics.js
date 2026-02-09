/**
 * Composant arrow-physics — Simulation physique manuelle des fleches
 * Gravite, drag, raycasting pour les collisions
 * Les fleches s'attachent aux cibles et disparaissent avec elles
 */

import { clearTimer, safeRemove } from '../utils.js';

/* Vecteurs reutilises pour eviter les allocations dans tick() */
const _gravityAcc = new THREE.Vector3();
const _dragForce = new THREE.Vector3();
const _displacement = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _currentPos = new THREE.Vector3();

AFRAME.registerComponent('arrow-physics', {
  schema: {
    speed: { type: 'number', default: 55 },
    gravity: { type: 'number', default: 0.005 },
    mass: { type: 'number', default: 0.001 },
    dragCoefficient: { type: 'number', default: 0.0005 },
    fallSpeedThreshold: { type: 'number', default: 4 },
    fallGravity: { type: 'number', default: 9.8 },
  },

  init() {
    this.hasCollided = false;
    this.isFalling = false;
    this.lifetime = 0;
    this.maxLifetime = 8000;
    this.noHitTimer = null;

    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();

    const worldQuat = new THREE.Quaternion();
    this.el.object3D.getWorldQuaternion(worldQuat);

    const initialDir = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat).normalize();
    this.velocity.copy(initialDir).multiplyScalar(this.data.speed);

    console.log('Arrow created:', {
      x: this.velocity.x.toFixed(2),
      y: this.velocity.y.toFixed(2),
      z: this.velocity.z.toFixed(2),
      speed: this.data.speed.toFixed(1),
    });

    this.raycaster = new THREE.Raycaster();
    this.collisionObjects = [];
    this.updateCollisionObjects();

    this.noHitTimer = setTimeout(() => {
      console.log('Arrow expired (no collision after 5s)');
      this.removeArrow();
    }, 5000);
  },

  updateCollisionObjects() {
    const { sceneEl } = this.el;

    for (const target of sceneEl.querySelectorAll('[target-behavior]')) {
      if (target.object3D) {
        this.collisionObjects.push({ object: target.object3D, entity: target, type: 'target' });
      }
    }

    for (const mesh of sceneEl.querySelectorAll('[geometry]')) {
      if (mesh === this.el || mesh.hasAttribute('target-behavior')) continue;

      let isHud = false;
      let current = mesh;
      while (current && current !== sceneEl) {
        if (current.hasAttribute?.('hud-element')) { isHud = true; break; }
        current = current.parentNode;
      }

      if (!isHud && mesh.object3D) {
        this.collisionObjects.push({ object: mesh.object3D, entity: mesh, type: 'environment' });
      }
    }

    console.log(`${this.collisionObjects.length} collision objects detected`);
  },

  tick(time, deltaTime) {
    if (this.hasCollided) return;

    const dt = deltaTime / 1000;
    const { gravity, dragCoefficient, mass } = this.data;

    this.lifetime += deltaTime;
    if (this.lifetime > this.maxLifetime) {
      this.removeArrow();
      return;
    }

    const speed = this.velocity.length();

    // Switch to falling mode when speed drops below threshold
    if (!this.isFalling && speed < this.data.fallSpeedThreshold) {
      this.isFalling = true;
      console.log(`Arrow falling (speed: ${speed.toFixed(2)} < ${this.data.fallSpeedThreshold})`);
    }

    if (this.isFalling) {
      // Strong real gravity, no drag
      _gravityAcc.set(0, -this.data.fallGravity, 0);
      this.velocity.addScaledVector(_gravityAcc, dt);
    } else {
      _gravityAcc.set(0, -gravity, 0);

      if (speed > 0.0001) {
        _dragForce.copy(this.velocity).normalize()
          .multiplyScalar(-dragCoefficient * speed * speed)
          .divideScalar(mass);
      } else {
        _dragForce.set(0, 0, 0);
      }

      this.acceleration.copy(_gravityAcc).add(_dragForce);
      this.velocity.addScaledVector(this.acceleration, dt);
    }

    _displacement.copy(this.velocity).multiplyScalar(dt);

    if (speed > 0.1) {
      const targetQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        this.velocity.clone().normalize(),
      );
      this.el.object3D.quaternion.copy(targetQuat);
    }

    this.el.object3D.getWorldPosition(_worldPos);
    if (this.checkMenuHit('[vr-menu]', 'vr-menu', _worldPos)) return;
    if (this.checkMenuHit('[end-menu]', 'end-menu', _worldPos)) return;

    _currentPos.copy(this.el.object3D.position);
    const rayDist = _displacement.length();
    _rayDir.copy(rayDist > 0 ? _displacement : this.velocity).normalize();

    this.raycaster.set(_currentPos, _rayDir);
    this.raycaster.far = Math.max(rayDist * 1.2, 0.001);

    const allObjects = this.collisionObjects.map((o) => o.object);
    const intersects = this.raycaster.intersectObjects(allObjects, true);

    if (intersects.length > 0 && intersects[0].distance <= rayDist) {
      this.handleCollision(intersects[0]);
    } else {
      this.el.object3D.position.add(_displacement);
    }
  },

  checkMenuHit(selector, componentName, worldPos) {
    const menuEl = this.el.sceneEl.querySelector(selector);
    const comp = menuEl?.components?.[componentName];
    if (comp?.checkArrowHit(worldPos)) {
      console.log(`Menu ${componentName} hit!`);
      this.hasCollided = true;
      this.removeArrow();
      return true;
    }
    return false;
  },

  handleCollision(intersection) {
    if (this.hasCollided) return;
    this.hasCollided = true;
    this.noHitTimer = clearTimer(this.noHitTimer);

    const impactPoint = intersection.point;
    const { hitEntity, hitType } = this.findHitEntity(intersection);

    console.log(`Collision: ${hitType}`);

    if (hitType === 'target' && hitEntity?.components?.['target-behavior']) {
      this.attachToTarget(hitEntity, impactPoint, intersection);
    } else {
      this.plantInEnvironment(impactPoint, intersection);
    }
  },

  findHitEntity(intersection) {
    for (const collisionObj of this.collisionObjects) {
      let current = intersection.object;
      while (current) {
        if (current === collisionObj.object) {
          return { hitEntity: collisionObj.entity, hitType: collisionObj.type };
        }
        current = current.parent;
      }
    }
    return { hitEntity: null, hitType: 'environment' };
  },

  attachToTarget(hitEntity, impactPoint, intersection) {
    hitEntity.components['target-behavior'].onArrowHit(this.el, impactPoint);

    const localPos = hitEntity.object3D.worldToLocal(impactPoint.clone());
    const savedRotation = this.el.object3D.rotation.clone();

    hitEntity.appendChild(this.el);
    this.el.object3D.position.copy(localPos);
    this.el.object3D.rotation.copy(savedRotation);

    const faceNormal = intersection.face?.normal;
    if (faceNormal) {
      const offset = faceNormal.clone().multiplyScalar(0.1);
      const localOffset = offset.applyQuaternion(hitEntity.object3D.quaternion.clone().invert());
      this.el.object3D.position.add(localOffset);
    }

    console.log('Arrow attached to target');
  },

  plantInEnvironment(impactPoint, intersection) {
    this.el.object3D.position.copy(impactPoint);

    const faceNormal = intersection.face?.normal;
    if (faceNormal) {
      this.el.object3D.position.addScaledVector(faceNormal, 0.1);
    }

    setTimeout(() => this.animateRemoval(), 5000);
  },

  animateRemoval() {
    if (!this.el?.parentNode) return;

    let elapsed = 0;
    const duration = 500;
    const startScale = this.el.getAttribute('scale') || { x: 1, y: 1, z: 1 };

    const animate = () => {
      elapsed += 16;
      const progress = Math.min(elapsed / duration, 1);
      const s = startScale.x * (1 - progress);
      this.el.setAttribute('scale', `${s} ${s} ${s}`);

      progress < 1 ? requestAnimationFrame(animate) : this.removeArrow();
    };
    animate();
  },

  removeArrow() {
    this.noHitTimer = clearTimer(this.noHitTimer);
    safeRemove(this.el);
  },

  remove() {
    this.noHitTimer = clearTimer(this.noHitTimer);
  },
});
