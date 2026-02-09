/**
 * Composant score-hud pour A-Frame
 * HUD VR medieval attache a la camera
 */

import { MEDIEVAL_COLORS, createPanel, createText, safeRemove } from '../utils.js';

AFRAME.registerComponent('score-hud', {
  schema: {
    position: { type: 'vec3', default: { x: 0, y: 0.35, z: -1.2 } },
  },

  init() {
    this.score = 0;
    this.timeRemaining = 10;

    this.onScoreUpdateBound = this.onScoreUpdate.bind(this);
    const { sceneEl } = this.el;

    sceneEl.addEventListener('target-hit', this.onScoreUpdateBound);
    sceneEl.addEventListener('start-game', () => { this.createHUD(); this.showHUD(); });
    sceneEl.addEventListener('game-ended', () => this.hideHUD());

    console.log('Score HUD VR ready');
  },

  showHUD() {
    this.hudContainer?.setAttribute('visible', true);
  },

  hideHUD() {
    this.hudContainer?.setAttribute('visible', false);
  },

  createHUD() {
    safeRemove(this.hudContainer);

    const { gold, darkWood, white, parchment } = MEDIEVAL_COLORS;
    const container = document.createElement('a-entity');
    container.setAttribute('position', this.data.position);
    container.setAttribute('hud-element', '');
    this.el.appendChild(container);
    this.hudContainer = container;

    container.appendChild(createPanel({ width: 0.6, height: 0.35, color: gold, position: '0 0 -0.002' }));
    container.appendChild(createPanel({ width: 0.56, height: 0.31, color: darkWood, opacity: 0.95, position: '0 0 -0.001' }));

    this.timerText = createText({ value: '10', color: white, width: 3, position: '0 0.06 0.01' });
    container.appendChild(this.timerText);

    container.appendChild(createText({ value: 'secondes', color: gold, width: 0.8, position: '0 -0.02 0.01' }));
    container.appendChild(createPanel({ width: 0.45, height: 0.005, color: gold, position: '0 -0.06 0.01' }));

    this.scoreText = createText({ value: 'Butin: 0', color: parchment, width: 1.2, position: '0 -0.1 0.01' });
    container.appendChild(this.scoreText);

    console.log('HUD VR created');
  },

  onScoreUpdate() {
    const gm = this.el.sceneEl.systems?.['game-manager'];
    if (!gm) return;

    setTimeout(() => {
      this.score = gm.totalScore;
      this.scoreText?.setAttribute('value', `Butin: ${this.score}`);
      this.flashScore();
    }, 10);
  },

  flashScore() {
    if (!this.scoreText) return;

    this.scoreText.setAttribute('animation', {
      property: 'scale', from: '1 1 1', to: '1.3 1.3 1', dur: 150, easing: 'easeOutQuad',
    });
    this.scoreText.setAttribute('color', '#00ff00');

    setTimeout(() => {
      if (!this.scoreText) return;
      this.scoreText.setAttribute('color', MEDIEVAL_COLORS.parchment);
      this.scoreText.setAttribute('scale', '1 1 1');
    }, 200);
  },

  tick() {
    const gm = this.el.sceneEl.systems?.['game-manager'];
    if (!gm?.gameRunning || !this.timerText) return;

    const newTime = gm.gameTime;
    if (newTime === this.timeRemaining) return;

    this.timeRemaining = newTime;
    this.timerText.setAttribute('value', String(this.timeRemaining));

    if (this.timeRemaining <= 3) {
      this.timerText.setAttribute('color', MEDIEVAL_COLORS.red);
      this.timerText.setAttribute('animation', {
        property: 'scale', from: '1 1 1', to: '1.2 1.2 1',
        dur: 300, dir: 'alternate', loop: true,
      });
    }
  },

  remove() {
    this.el.sceneEl?.removeEventListener('target-hit', this.onScoreUpdateBound);
    safeRemove(this.hudContainer);
  },
});
