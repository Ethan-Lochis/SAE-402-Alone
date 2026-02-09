/**
 * Composant end-menu
 * Menu de fin de partie medieval avec score, stats et bouton replay
 * Interaction par fleche (checkArrowHit) ou clic VR classique
 */

import { MEDIEVAL_COLORS, createPanel, createText, safeRemove } from '../utils.js';

const _replayWorldPos = new THREE.Vector3();

AFRAME.registerComponent('end-menu', {
  schema: {
    score: { type: 'number', default: 0 },
    hits: { type: 'number', default: 0 },
    arrows: { type: 'number', default: 0 },
  },

  init() {
    this.isVisible = true;
    this.createEndPanel();
    console.log('🏁 Menu de fin initialisé - Score:', this.data.score);
  },

  createEndPanel() {
    const menu = this.el;
    menu.setAttribute('position', '0 1.5 -2.5');
    menu.setAttribute('rotation', '0 0 0');

    const { gold, darkWood, parchment, bronze } = MEDIEVAL_COLORS;

    menu.appendChild(createPanel({ width: 1.5, height: 1.6, color: gold, position: '0 0 -0.002' }));
    menu.appendChild(createPanel({ width: 1.44, height: 1.54, color: darkWood, opacity: 0.98, position: '0 0 -0.001' }));
    menu.appendChild(createPanel({ width: 1.3, height: 1.4, color: parchment, opacity: 0.15, position: '0 0 0' }));

    menu.appendChild(createText({ value: '⚔️ FIN DE QUETE ⚔️', position: '0 0.58 0.01', color: gold, width: 2 }));

    // Separateur titre
    menu.appendChild(createPanel({ width: 1.1, height: 0.015, color: gold, position: '0 0.45 0.01' }));

    menu.appendChild(createText({ value: '~ VOTRE BUTIN ~', position: '0 0.32 0.01', color: gold, width: 1.5 }));
    menu.appendChild(createText({ value: `${this.data.score}`, position: '0 0.12 0.01', color: '#fff', width: 5 }));
    menu.appendChild(createText({ value: 'points', position: '0 -0.02 0.01', color: bronze, width: 1.2 }));

    // Separateur stats
    menu.appendChild(createPanel({ width: 0.8, height: 0.008, color: gold, opacity: 0.5, position: '0 -0.15 0.01' }));

    const { hits, arrows } = this.data;
    const accuracy = arrows > 0 ? Math.round((hits / arrows) * 100) : 0;

    menu.appendChild(createText({
      value: `Touches: ${hits}  |  Fleches: ${arrows}  |  Precision: ${accuracy}%`,
      position: '0 -0.28 0.01',
      color: '#bbb',
      width: 1.2,
    }));

    this.createReplayButton(menu);
  },

  createReplayButton(menu) {
    const { gold } = MEDIEVAL_COLORS;

    const buttonContainer = document.createElement('a-entity');
    buttonContainer.setAttribute('position', '0 -0.52 0.05');
    buttonContainer.id = 'replay-button';
    buttonContainer.classList.add('clickable');

    const target = document.createElement('a-entity');
    target.setAttribute('geometry', { primitive: 'cylinder', radius: 0.16, height: 0.05 });
    target.setAttribute('material', { color: '#1a5f1a', shader: 'flat' });
    target.setAttribute('rotation', '90 0 0');
    target.setAttribute('position', '0 0 0');
    target.classList.add('clickable');
    buttonContainer.appendChild(target);

    const bullseye = document.createElement('a-entity');
    bullseye.setAttribute('geometry', { primitive: 'cylinder', radius: 0.06, height: 0.06 });
    bullseye.setAttribute('material', { color: gold, shader: 'flat' });
    bullseye.setAttribute('rotation', '90 0 0');
    bullseye.setAttribute('position', '0 0 0.01');
    bullseye.classList.add('clickable');
    buttonContainer.appendChild(bullseye);

    buttonContainer.appendChild(createText({
      value: '🔄 NOUVELLE QUETE',
      position: '0 -0.22 0',
      color: gold,
      width: 1.5,
    }));

    target.setAttribute('animation', {
      property: 'scale',
      from: '1 1 1',
      to: '1.15 1.15 1.15',
      dur: 700,
      dir: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });

    menu.appendChild(buttonContainer);

    this.replayButton = buttonContainer;
    this.replayButtonWorldPos = new THREE.Vector3();

    buttonContainer.addEventListener('click', () => {
      console.log('🖱️ Bouton cliqué !');
      this.onReplayClick();
    });

    buttonContainer.addEventListener('mouseenter', () => {
      target.setAttribute('material', 'color', '#2a8f2a');
    });

    buttonContainer.addEventListener('mouseleave', () => {
      target.setAttribute('material', 'color', '#1a5f1a');
    });
  },

  checkArrowHit(arrowPosition) {
    if (!this.isVisible || !this.replayButton) return false;

    this.replayButton.object3D.getWorldPosition(this.replayButtonWorldPos);
    const distance = arrowPosition.distanceTo(this.replayButtonWorldPos);

    if (distance < 0.5) {
      console.log('🔄 Bouton REJOUER touché !');
      this.onReplayClick();
      return true;
    }

    return false;
  },

  onReplayClick() {
    console.log('🔄 Relancement du jeu...');

    const hud = document.getElementById('game-hud');
    if (hud) hud.remove();

    const targets = this.el.sceneEl.querySelectorAll('[target-behavior]');
    targets.forEach((t) => t.remove());

    const arrows = this.el.sceneEl.querySelectorAll('[arrow-physics]');
    arrows.forEach((a) => a.remove());

    this.hideMenu();

    const startMenu = document.createElement('a-entity');
    startMenu.setAttribute('vr-menu', '');
    this.el.sceneEl.appendChild(startMenu);
  },

  hideMenu() {
    if (!this.isVisible) return;
    this.isVisible = false;

    this.el.setAttribute('animation', {
      property: 'scale',
      to: '0 0 0',
      dur: 300,
      easing: 'easeInQuad',
    });

    setTimeout(() => {
      safeRemove(this.el);
    }, 350);

    console.log('🏁 Menu de fin caché');
  },
});
