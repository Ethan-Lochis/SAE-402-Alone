/**
 * Composant bow-string
 * Cree et anime la corde de l'arc en Three.js
 * La corde se courbe en fonction de la distance de tirage
 */

import { disposeThreeObject } from '../utils.js';

/* Vecteurs reutilises dans tick() */
const _topAnchor = new THREE.Vector3();
const _bottomAnchor = new THREE.Vector3();
const _middlePoint = new THREE.Vector3();
const _forwardDir = new THREE.Vector3();
const _bowRotation = new THREE.Quaternion();

AFRAME.registerComponent('bow-string', {
  schema: {
    stringColor: { type: 'color', default: '#ffffff' },
    stringWidth: { type: 'number', default: 0.001 },
    topAnchor: { type: 'vec3', default: { x: 0, y: 0.35, z: 0 } },
    bottomAnchor: { type: 'vec3', default: { x: 0, y: -0.35, z: 0 } },
    restOffset: { type: 'number', default: 0.08 },
    rotation: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
  },

  init() {
    this.rightHand = null;
    this.leftHand = null;
    this.bowDrawSystem = null;
    this.isDrawing = false;
    this.currentDrawDistance = 0;

    this.tempBowPosition = new THREE.Vector3();
    this.tempVectorRight = new THREE.Vector3();

    this.debugLog('INIT bow-string component');
    this.createBowString();
    this.findSystems();
  },

  debugLog(message) {
    console.log(message);
    const errorList = document.getElementById('error-list');
    if (errorList) {
      const li = document.createElement('li');
      li.textContent = message;
      errorList.appendChild(li);
    }
  },

  findSystems() {
    this.leftHand = document.querySelector('[hand-controls][hand="left"]')
      || document.querySelector('#leftHand');
    this.rightHand = document.querySelector('[hand-controls][hand="right"]')
      || document.querySelector('#rightHand');

    const bowDrawEntity = document.querySelector('[bow-draw-system]');
    this.bowDrawSystem = bowDrawEntity?.components?.['bow-draw-system'] ?? null;

    if (this.bowDrawSystem) this.debugLog('bow-draw-system connected');
    this.debugLog(`Hands found: left=${!!this.leftHand} right=${!!this.rightHand}`);
  },

  createBowString() {
    this.debugLog('Creating bow string...');

    const segments = 20;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push(new THREE.Vector3(0, -0.35 + t * 0.7, 0));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, this.data.stringWidth, 8, false);
    const material = new THREE.MeshBasicMaterial({
      color: this.data.stringColor,
      side: THREE.DoubleSide,
    });

    this.bowStringMesh = new THREE.Mesh(geometry, material);
    this.el.sceneEl?.object3D?.add(this.bowStringMesh);

    this.curve = curve;
    this.points = points;
    this.segments = segments;

    // Rotation locale pre-calculee
    const { rotation } = this.data;
    this.localRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z),
      'XYZ',
    ));

    this.debugLog(`String mesh added - Color: ${this.data.stringColor}`);
  },

  tick() {
    if (!this.bowStringMesh) return;

    // Retry finding systems if needed
    if (!this.leftHand || !this.rightHand || !this.bowDrawSystem) {
      this.findSystems();
    }

    if (this.bowDrawSystem) {
      this.isDrawing = !!this.bowDrawSystem.isDrawing;
      this.currentDrawDistance = this.bowDrawSystem.drawDistance || 0;
    }

    if (!this.leftHand) return;

    // Position de l'arc (main gauche)
    this.leftHand.object3D.getWorldPosition(this.tempBowPosition);

    // Points d'ancrage en coordonnees locales
    const { topAnchor: ta, bottomAnchor: ba } = this.data;
    _topAnchor.set(ta.x, ta.y, ta.z);
    _bottomAnchor.set(ba.x, ba.y, ba.z);

    // Appliquer rotation locale de la corde
    if (this.localRotation) {
      _topAnchor.applyQuaternion(this.localRotation);
      _bottomAnchor.applyQuaternion(this.localRotation);
    }

    // Transformer par la rotation de la main gauche
    this.leftHand.object3D.getWorldQuaternion(_bowRotation);
    _topAnchor.applyQuaternion(_bowRotation).add(this.tempBowPosition);
    _bottomAnchor.applyQuaternion(_bowRotation).add(this.tempBowPosition);

    // Debug sphere
    this.debugSphere?.position.copy(_topAnchor);

    // Point milieu
    if (this.isDrawing && this.rightHand) {
      this.rightHand.object3D.getWorldPosition(this.tempVectorRight);
      _middlePoint.copy(this.tempVectorRight);
    } else {
      _middlePoint.set(
        (_topAnchor.x + _bottomAnchor.x) / 2,
        (_topAnchor.y + _bottomAnchor.y) / 2,
        (_topAnchor.z + _bottomAnchor.z) / 2,
      );
      _forwardDir.set(0, 0, this.data.restOffset).applyQuaternion(_bowRotation);
      _middlePoint.add(_forwardDir);
    }

    // Bezier quadratique pour tous les points
    for (let i = 0; i <= this.segments; i++) {
      const t = i / this.segments;
      const omt = 1 - t;
      const p = this.points[i];

      p.x = omt * omt * _topAnchor.x + 2 * omt * t * _middlePoint.x + t * t * _bottomAnchor.x;
      p.y = omt * omt * _topAnchor.y + 2 * omt * t * _middlePoint.y + t * t * _bottomAnchor.y;
      p.z = omt * omt * _topAnchor.z + 2 * omt * t * _middlePoint.z + t * t * _bottomAnchor.z;
    }

    // Reconstruire la geometrie
    this.curve.points = this.points;
    this.bowStringMesh.geometry?.dispose();
    this.bowStringMesh.geometry = new THREE.TubeGeometry(
      this.curve, this.segments, this.data.stringWidth, 8, false,
    );
  },

  remove() {
    const sceneObj = this.el?.sceneEl?.object3D;
    disposeThreeObject(this.bowStringMesh, sceneObj);
    this.bowStringMesh = null;

    disposeThreeObject(this.debugSphere, sceneObj);
    this.debugSphere = null;
  },
});
