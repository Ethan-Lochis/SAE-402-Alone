/**
 * Utilitaires partagés pour Archery XR
 * DRY : fonctions réutilisées dans plusieurs composants
 */

/**
 * Joue un son HTML audio par son id
 * @param {string} id - L'id de l'élément <audio>
 * @param {number} [volume] - Volume optionnel (0-1)
 */
export const playSound = (id, volume) => {
  try {
    const audio = document.getElementById(id);
    if (!audio) return;
    audio.currentTime = 0;
    if (volume !== undefined) audio.volume = volume;
    audio.play().catch(() => {});
  } catch { /* son non disponible */ }
};

/**
 * Retire un élément A-Frame du DOM de manière sûre
 * @param {Element} el - L'élément à retirer
 */
export const safeRemove = (el) => {
  el?.parentNode?.removeChild(el);
};

/**
 * Dispose d'un objet Three.js (geometry + material) et le retire de son parent
 * @param {THREE.Object3D} obj - L'objet à nettoyer
 * @param {THREE.Object3D} [parent] - Le parent duquel retirer l'objet
 */
export const disposeThreeObject = (obj, parent) => {
  if (!obj) return;
  obj.geometry?.dispose();
  obj.material?.dispose();
  parent?.remove(obj);
};

/**
 * Couleurs médiévales partagées pour l'UI
 */
export const MEDIEVAL_COLORS = Object.freeze({
  darkWood: '#2d1b0e',
  lightWood: '#4a3728',
  gold: '#d4af37',
  parchment: '#f4e4bc',
  darkRed: '#8b0000',
  bronze: '#cd7f32',
  white: '#ffffff',
  red: '#e74c3c',
});

/**
 * Crée un plan A-Frame décoratif (bordure, séparateur, fond)
 * @param {object} opts - Options { width, height, color, opacity, position, shader }
 * @returns {Element}
 */
export const createPanel = ({ width, height, color, opacity = 1, position = '0 0 0', shader = 'flat' }) => {
  const el = document.createElement('a-entity');
  el.setAttribute('geometry', { primitive: 'plane', width, height });
  el.setAttribute('material', { color, opacity, shader });
  el.setAttribute('position', position);
  return el;
};

/**
 * Crée un texte A-Frame
 * @param {object} opts - Options { value, position, align, color, width }
 * @returns {Element}
 */
export const createText = ({ value, position = '0 0 0', align = 'center', color = '#fff', width = 1 }) => {
  const el = document.createElement('a-text');
  el.setAttribute('value', value);
  el.setAttribute('position', position);
  el.setAttribute('align', align);
  el.setAttribute('color', color);
  el.setAttribute('width', String(width));
  return el;
};

/**
 * Nettoie un timer (clearTimeout / clearInterval) de manière sûre
 * @param {number|null} timerId - L'id du timer
 * @param {'timeout'|'interval'} [type='timeout']
 * @returns {null}
 */
export const clearTimer = (timerId, type = 'timeout') => {
  if (timerId == null) return null;
  type === 'interval' ? clearInterval(timerId) : clearTimeout(timerId);
  return null;
};

/**
 * Clone un vecteur THREE.Vector3 ou en crée un depuis un objet {x, y, z}
 * @param {object} v - Objet avec x, y, z
 * @returns {THREE.Vector3}
 */
export const toVec3 = (v) =>
  v?.clone ? v.clone() : new THREE.Vector3(v?.x || 0, v?.y || 0, v?.z || 0);

/**
 * Clone un quaternion THREE.Quaternion ou en crée un depuis un objet {x, y, z, w}
 * @param {object} q
 * @returns {THREE.Quaternion}
 */
export const toQuat = (q) =>
  q?.clone ? q.clone() : new THREE.Quaternion(q?.x || 0, q?.y || 0, q?.z || 0, q?.w || 1);
