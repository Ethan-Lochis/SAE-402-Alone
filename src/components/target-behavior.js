/**
 * Composant target-behavior - Cibles avec scoring de precision
 * 4 zones : bullseye (x3), middle (x2), outer (x1), edge (x0.5)
 * Systeme de HP, animations de hit/destruction, cibles mobiles
 */

import { playSound, safeRemove, clearTimer } from '../utils.js';

/* Vecteur reutilise pour eviter les allocations dans onArrowHit */
const _localImpact = new THREE.Vector3();

AFRAME.registerComponent('target-behavior', {
  schema: {
    points: { type: 'number', default: 10 },
    hp: { type: 'number', default: 1 },
    movable: { type: 'boolean', default: false },
    centerRadius: { type: 'number', default: 0.1 },
    middleRadius: { type: 'number', default: 0.3 },
    outerRadius: { type: 'number', default: 0.5 },
  },

  init() {
    this.currentHp = this.data.hp;
    this.hitCount = 0;
    this.hitByArrows = new Set();
    this.surfaceType = this.el.getAttribute('surface-type') || 'random';
    this.moveInterval = null;

    if (this.data.movable) {
      this.setupMovement();
    }

    const { points, hp } = this.data;
    console.log(`🎯 Cible créée: ${points} points, ${hp} HP (surface: ${this.surfaceType})`);
  },

  onArrowHit(arrowEl, impactPoint) {
    try {
      if (!impactPoint) {
        console.error('No impact point provided');
        return;
      }

      const arrowId = arrowEl.id || arrowEl.uuid || arrowEl;
      if (this.hitByArrows.has(arrowId)) {
        console.log('⚠️ Cette flèche a déjà touché cette cible, ignoré');
        return;
      }

      this.hitByArrows.add(arrowId);
      this.hitCount++;
      this.currentHp--;

      /* Calcul de precision en coordonnees locales */
      _localImpact.copy(impactPoint);
      this.el.object3D.worldToLocal(_localImpact);

      const distanceToCenter = Math.hypot(_localImpact.x, _localImpact.y);

      const { centerRadius, middleRadius, outerRadius, points } = this.data;
      let precisionMultiplier;
      let hitZone;

      if (distanceToCenter <= centerRadius) {
        precisionMultiplier = 3.0;
        hitZone = 'bullseye';
      } else if (distanceToCenter <= middleRadius) {
        precisionMultiplier = 2.0;
        hitZone = 'middle';
      } else if (distanceToCenter <= outerRadius) {
        precisionMultiplier = 1.0;
        hitZone = 'outer';
      } else {
        precisionMultiplier = 0.5;
        hitZone = 'edge';
      }

      const finalPoints = Math.floor(points * precisionMultiplier);

      console.log(
        `💥 Cible touchée! Zone: ${hitZone} | Distance: ${distanceToCenter.toFixed(3)}m | Points: ${finalPoints} | HP restants: ${this.currentHp}`,
      );

      playSound('hit-sound');

      this.playHitAnimation(hitZone);
      this.showHitFeedback(_localImpact, finalPoints, hitZone);

      try {
        console.log(`🎯 [TARGET] Émission événement target-hit avec ${finalPoints} points`);
        this.el.sceneEl.emit('target-hit', {
          points: finalPoints,
          zone: hitZone,
          multiplier: precisionMultiplier,
          position: this.el.object3D.position,
          distanceToCenter,
          surfaceType: this.surfaceType,
        });
        console.log('✅ [TARGET] Événement target-hit émis avec succès');
      } catch (e) {
        console.error('❌ [TARGET] Event emission error:', e);
      }

      if (this.currentHp <= 0) {
        this.destroy(finalPoints);
      }
    } catch (e) {
      console.error('onArrowHit error:', e);
    }
  },

  playHitAnimation(zone) {
    try {
      const originalScale = this.el.getAttribute('scale');
      const bump = zone === 'bullseye' ? 1.3 : zone === 'middle' ? 1.2 : 1.1;

      this.el.setAttribute('scale', {
        x: originalScale.x * bump,
        y: originalScale.y * bump,
        z: originalScale.z * bump,
      });

      setTimeout(() => {
        this.el.setAttribute('scale', originalScale);
      }, 150);
    } catch (e) {
      console.error('Hit animation error:', e);
    }
  },

  showHitFeedback(localPosition, points, zone) {
    console.log(`✓ Hit feedback: +${points} points in ${zone} zone`);
  },

  destroy(lastPoints) {
    console.log('🎉 Cible détruite!');

    try {
      let elapsed = 0;
      const duration = 400;
      const { x: sx, y: sy, z: sz } = this.el.getAttribute('scale');
      const { x: rx, y: ry, z: rz } = this.el.getAttribute('rotation');

      const animateDestroy = () => {
        elapsed += 16;
        const progress = Math.min(elapsed / duration, 1);
        const shrink = 1 - progress;

        this.el.setAttribute('scale', `${sx * shrink} ${sy * shrink} ${sz * shrink}`);
        this.el.setAttribute('rotation', `${rx} ${ry + progress * 360} ${rz}`);

        if (progress < 1) {
          requestAnimationFrame(animateDestroy);
        }
      };

      animateDestroy();
    } catch (e) {
      console.error('Destroy animation error:', e);
    }

    try {
      this.el.sceneEl.emit('target-destroyed', {
        points: this.data.points,
        totalHits: this.hitCount,
        bonusPoints: Math.floor(lastPoints * 0.5),
        surfaceType: this.surfaceType,
        targetId: this.el.id,
      });
    } catch (e) {
      console.error('Event emission error:', e);
    }

    setTimeout(() => safeRemove(this.el), 450);
  },

  setupMovement() {
    try {
      const { x: bx, y: by, z: bz } = this.el.getAttribute('position');
      const speed = 0.002;
      let time = 0;

      this.moveInterval = setInterval(() => {
        if (!this.el?.parentNode) {
          this.moveInterval = clearTimer(this.moveInterval, 'interval');
          return;
        }

        time += 16;
        const t = time * speed;
        this.el.setAttribute(
          'position',
          `${bx + Math.sin(t) * 1.5} ${by + Math.cos(t) * 0.5} ${bz + Math.sin(t * 0.5) * 1}`,
        );
      }, 16);

      console.log('🎯 Cible mobile activée');
    } catch (e) {
      console.error('Movement error:', e);
    }
  },

  remove() {
    this.moveInterval = clearTimer(this.moveInterval, 'interval');
  },
});
