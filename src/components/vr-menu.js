/**
 * Composant vr-menu
 * Menu de demarrage VR medieval avec interaction par fleche
 * Panneau flottant avec titre, sections et bouton cible pulsant
 */

import { MEDIEVAL_COLORS, createPanel, createText, safeRemove } from '../utils.js';

const HIT_RADIUS = 0.5;
const HIDE_DURATION = 300;
const REMOVE_DELAY = 350;

AFRAME.registerComponent('vr-menu', {
  init() {
    this.isVisible = true;
    this.playButton = null;
    this.playButtonWorldPos = new THREE.Vector3();

    this.createMenuPanel();

    this.el.sceneEl?.addEventListener('start-game', () => this.hideMenu());

    console.log('📋 VR Menu initialise');
  },

  createMenuPanel() {
    const menu = this.el;
    menu.setAttribute('position', '0 1.5 -2.5');
    menu.setAttribute('rotation', '0 0 0');

    const { gold, darkWood, parchment } = MEDIEVAL_COLORS;

    // Bordure doree
    menu.appendChild(createPanel({
      width: 1.5, height: 1.7, color: gold, position: '0 0 -0.002',
    }));

    // Fond bois sombre
    menu.appendChild(createPanel({
      width: 1.44, height: 1.64, color: darkWood, opacity: 0.98, position: '0 0 -0.001',
    }));

    // Parchemin transparent
    menu.appendChild(createPanel({
      width: 1.3, height: 1.5, color: parchment, opacity: 0.15, position: '0 0 0',
    }));

    // Titre
    menu.appendChild(createText({
      value: '⚔️ ARCHERY XR ⚔️',
      position: '0 0.62 0.01',
      color: gold,
      width: 2.2,
    }));

    // Separateur
    menu.appendChild(createPanel({
      width: 1.1, height: 0.015, color: gold, position: '0 0.48 0.01',
    }));

    // Section Quete
    menu.appendChild(createText({
      value: '~ QUETE ~',
      position: '0 0.35 0.01',
      color: gold,
      width: 1.6,
    }));
    menu.appendChild(createText({
      value: 'Abattez les cibles avec vos\nfleches pour gagner des points !',
      position: '0 0.2 0.01',
      color: '#ddd',
      width: 1.3,
    }));

    // Section Controles
    menu.appendChild(createText({
      value: '~ CONTROLES ~',
      position: '0 0.02 0.01',
      color: gold,
      width: 1.6,
    }));
    menu.appendChild(createText({
      value: 'Main gauche : Arc\nMain droite : Tirer (Gachette)',
      position: '0 -0.12 0.01',
      color: '#ddd',
      width: 1.3,
    }));

    // Section Recompenses
    menu.appendChild(createText({
      value: '~ RECOMPENSES ~',
      position: '0 -0.28 0.01',
      color: gold,
      width: 1.6,
    }));
    menu.appendChild(createText({
      value: 'Centre : x3  |  Milieu : x2  |  Bord : x1',
      position: '0 -0.4 0.01',
      color: '#ddd',
      width: 1.3,
    }));

    this.createPlayButton(menu);
  },

  createPlayButton(menu) {
    const { darkRed, gold } = MEDIEVAL_COLORS;

    const buttonContainer = document.createElement('a-entity');
    buttonContainer.setAttribute('position', '0 -0.62 0.05');
    buttonContainer.id = 'play-button';

    // Cercle cible rouge
    const target = document.createElement('a-entity');
    target.setAttribute('geometry', { primitive: 'cylinder', radius: 0.18, height: 0.05 });
    target.setAttribute('material', { color: darkRed, shader: 'flat' });
    target.setAttribute('rotation', '90 0 0');
    target.setAttribute('position', '0 0 0');
    buttonContainer.appendChild(target);

    // Centre dore (bullseye)
    const bullseye = document.createElement('a-entity');
    bullseye.setAttribute('geometry', { primitive: 'cylinder', radius: 0.07, height: 0.06 });
    bullseye.setAttribute('material', { color: gold, shader: 'flat' });
    bullseye.setAttribute('rotation', '90 0 0');
    bullseye.setAttribute('position', '0 0 0.01');
    buttonContainer.appendChild(bullseye);

    // Texte du bouton
    buttonContainer.appendChild(createText({
      value: '🎯 TIREZ POUR COMMENCER',
      position: '0 -0.28 0',
      color: gold,
      width: 1.6,
    }));

    // Animation pulsante
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

    this.playButton = buttonContainer;
  },

  checkArrowHit(arrowPosition) {
    if (!this.isVisible || !this.playButton) return false;

    this.playButton.object3D.getWorldPosition(this.playButtonWorldPos);
    const distance = arrowPosition.distanceTo(this.playButtonWorldPos);

    console.log(`📍 Distance fleche-bouton: ${distance.toFixed(2)}`);

    if (distance < HIT_RADIUS) {
      console.log('🎯 Bouton touche par une fleche !');
      this.onPlayClick();
      return true;
    }

    return false;
  },

  onPlayClick() {
    console.log('🎮 Bouton JOUER clique !');
    this.el.sceneEl?.emit('start-game');
    this.hideMenu();
  },

  hideMenu() {
    if (!this.isVisible) return;
    this.isVisible = false;

    this.el.setAttribute('animation', {
      property: 'scale',
      to: '0 0 0',
      dur: HIDE_DURATION,
      easing: 'easeInQuad',
    });

    setTimeout(() => safeRemove(this.el), REMOVE_DELAY);

    console.log('📋 Menu VR cache');
  },

  showMenu() {
    if (this.isVisible) return;
    this.isVisible = true;
    this.el.setAttribute('scale', '1 1 1');
    this.el.setAttribute('visible', true);
    console.log('📋 Menu VR affiche');
  },
});
