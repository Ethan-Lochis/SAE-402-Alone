/**
 * Système combo pour A-Frame
 * Gère les multiplicateurs de score basés sur les combos
 * Utilise aframe-state-component pour synchroniser l'état
 */

import { safeRemove } from '../utils.js';

const SCALE_DURATION = 500;
const FADE_DURATION = 1500;
const TOTAL_ANIM_DURATION = SCALE_DURATION + FADE_DURATION;
const FEEDBACK_REMOVE_DELAY = TOTAL_ANIM_DURATION + 100;
const TWO_PI_OVER_3 = (2 * Math.PI) / 3;

AFRAME.registerSystem('combo-system', {
  schema: {
    comboTimeout: { type: 'number', default: 2000 },
    maxMultiplier: { type: 'number', default: 5.0 },
  },

  init() {
    this.combo = 0;
    this.multiplier = 1.0;
    this.maxCombo = 0;
    this.lastHitTime = 0;
    this.comboActive = false;

    this.el.addEventListener('target-hit', this.onTargetHit.bind(this));

    console.log('🎯 Système de combo initialisé');
  },

  onTargetHit(evt) {
    const now = Date.now();
    const { zone } = evt.detail;

    if (this.comboActive && (now - this.lastHitTime) < this.data.comboTimeout) {
      this.combo++;
      if (zone === 'bullseye') this.combo++;
    } else {
      this.combo = 1;
      this.comboActive = true;
    }

    this.lastHitTime = now;
    this.maxCombo = Math.max(this.maxCombo, this.combo);

    this.multiplier = Math.min(
      1.0 + this.combo * 0.2,
      this.data.maxMultiplier,
    );

    this.el.setAttribute('state', 'combo', this.combo);
    this.el.setAttribute('state', 'multiplier', this.multiplier);

    console.log(`🔥 Combo: x${this.combo} | Multiplicateur: ${this.multiplier.toFixed(1)}x`);

    if (this.combo >= 3) this.showComboFeedback();
    this.updateComboDisplay();
  },

  showComboFeedback() {
    const camera = this.el.querySelector('[camera]');
    if (!camera) return;

    const { x, y, z } = camera.object3D.position;
    let comboText, color;

    if (this.combo >= 10) {
      comboText = `🔥🔥 MEGA COMBO x${this.combo}!! 🔥🔥`;
      color = '#FF0000';
    } else if (this.combo >= 5) {
      comboText = `🔥 SUPER COMBO x${this.combo}! 🔥`;
      color = '#FF4500';
    } else {
      comboText = `🔥 COMBO x${this.combo}!`;
      color = '#FFA500';
    }

    const feedback = document.createElement('a-text');
    feedback.setAttribute('value', comboText);
    feedback.setAttribute('position', `${x} ${y + 0.5} ${z - 2}`);
    feedback.setAttribute('align', 'center');
    feedback.setAttribute('color', color);
    feedback.setAttribute('width', '4');

    this.el.appendChild(feedback);

    let elapsed = 0;

    const animateFeedback = () => {
      elapsed += 16;

      // Scale (0 → SCALE_DURATION ms): elastic ease-out
      if (elapsed <= SCALE_DURATION) {
        const progress = elapsed / SCALE_DURATION;
        const easeOutElastic = progress === 1
          ? 1
          : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * TWO_PI_OVER_3) + 1;
        const scale = 0.5 + easeOutElastic;
        feedback.setAttribute('scale', `${scale} ${scale} ${scale}`);
      } else {
        feedback.setAttribute('scale', '1.5 1.5 1.5');
      }

      // Fade (SCALE_DURATION → TOTAL_ANIM_DURATION ms)
      if (elapsed > SCALE_DURATION) {
        const fadeProgress = Math.min((elapsed - SCALE_DURATION) / FADE_DURATION, 1);
        feedback.setAttribute('material', `opacity: ${1 - fadeProgress}`);
      }

      if (elapsed < TOTAL_ANIM_DURATION) {
        requestAnimationFrame(animateFeedback);
      }
    };

    requestAnimationFrame(animateFeedback);

    setTimeout(() => safeRemove(feedback), FEEDBACK_REMOVE_DELAY);
  },

  updateComboDisplay() {
    const comboEl = document.getElementById('combo-value');
    if (!comboEl) return;

    let displayText = `x${this.combo}`;
    if (this.multiplier > 1) {
      displayText += ` (${this.multiplier.toFixed(1)}x)`;
    }
    comboEl.textContent = displayText;

    if (this.combo >= 3) {
      comboEl.classList.add('combo-active');
      setTimeout(() => comboEl.classList.remove('combo-active'), 500);
    }
  },

  tick() {
    if (!this.comboActive) return;

    if (Date.now() - this.lastHitTime > this.data.comboTimeout) {
      this.comboActive = false;

      if (this.combo > 1) {
        console.log(`❌ Combo perdu: x${this.combo}`);
      }

      this.combo = 0;
      this.multiplier = 1.0;

      this.el.setAttribute('state', 'combo', 0);
      this.el.setAttribute('state', 'multiplier', 1.0);
      this.updateComboDisplay();
    }
  },

  getStats() {
    return {
      currentCombo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.multiplier,
    };
  },
});
