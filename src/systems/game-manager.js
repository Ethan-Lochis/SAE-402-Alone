/**
 * Système game-manager pour A-Frame
 * Gère le cycle de jeu, le spawn des cibles et le score global
 * Spawn sur surfaces réelles (hit-test) + fallback surface-detector
 */

import { playSound, clearTimer, safeRemove } from '../utils.js';

// Module-level reused THREE objects (perf: avoid allocations in tick/spawn)
const _cameraPos = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _cameraForward = new THREE.Vector3();
const _position = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _negZ = new THREE.Vector3(0, 0, -1);
const _tempObj = new THREE.Object3D();

// Difficulty presets
const DIFFICULTY = Object.freeze({
  easy:   { points: 10, hp: 1 },
  normal: { points: 15, hpChance: 0.7 },
  hard:   { points: 20, maxHp: 3 },
});

const VERTICAL_BONUS = 1.2;
const MIN_SPAWN_DISTANCE = 1.5;
const MAX_SPAWN_DISTANCE = 10;
const MIN_TARGET_SPACING = 0.5;

AFRAME.registerSystem('game-manager', {
  schema: {
    spawnInterval: { type: 'number', default: 500 },
    maxTargets: { type: 'number', default: 3 },
    difficulty: { type: 'string', default: 'normal' },
    requireRealSurfaces: { type: 'boolean', default: true },
  },

  init() {
    this.activeTargets = [];
    this.totalScore = 0;
    this.totalArrowsShot = 0;
    this.totalHits = 0;
    this.spawnTimer = null;
    this.countdownTimer = null;
    this.gameRunning = false;
    this.surfacesReady = false;
    this.surfaceDetector = null;
    this.sceneMeshHandler = null;
    this.anchorManager = null;
    this.useAnchors = false;
    this.firstTargetSpawned = false;
    this.gameTime = 60;

    this.el.addEventListener('target-hit', this.onTargetHit.bind(this));
    this.el.addEventListener('target-destroyed', this.onTargetDestroyed.bind(this));
    this.el.addEventListener('arrow-shot', this.onArrowShot.bind(this));

    this.el.addEventListener('anchor-manager-ready', () => {
      const anchorManagerEl = this.el.querySelector('[webxr-anchor-manager]');
      this.anchorManager = anchorManagerEl?.components?.['webxr-anchor-manager'] ?? null;
      this.useAnchors = !!this.anchorManager;
    });

    this.el.addEventListener('scene-mesh-handler-ready', () => {
      const handlerEl = this.el.querySelector('[scene-mesh-handler]');
      this.sceneMeshHandler = handlerEl?.components?.['scene-mesh-handler'] ?? null;
    });

    this.el.addEventListener('surfaces-detected', (evt) => {
      const { real = 0, mesh = 0, hitTest = 0 } = evt.detail ?? {};
      const hasRealSurface = Number(real) + Number(mesh) + Number(hitTest) > 0;

      if (this.data.requireRealSurfaces && !hasRealSurface) return;

      this.surfacesReady = true;
      const detectorEl = this.el.querySelector('[surface-detector]');
      this.surfaceDetector = detectorEl?.components?.['surface-detector'] ?? null;

      if (!this.gameRunning) this.startGame();
    });

    this.el.addEventListener('start-game', () => this.startGame());

    console.log('🎮 Game Manager initialisé');
  },

  startGame() {
    if (this.gameRunning) return;

    this.gameRunning = true;
    this.totalScore = 0;
    this.totalHits = 0;
    this.totalArrowsShot = 0;
    this.gameTime = 60;
    this.el.setAttribute('state', 'gameStarted', true);

    const bgSound = document.getElementById('background-sound');
    if (bgSound) {
      bgSound.volume = 0.3;
      bgSound.play().catch((e) => console.log('Son de fond non disponible:', e));
    }

    this.startTargetSpawning();
    this.createScoreDisplay();
    this.startCountdown();
  },

  startCountdown() {
    this.countdownTimer = setInterval(() => {
      this.gameTime--;
      this.updateTimerDisplay();
      console.log(`⏱️ Temps restant: ${this.gameTime}s`);
      if (this.gameTime <= 0) this.endGame();
    }, 1000);
  },

  updateTimerDisplay() {
    const timerEl = document.getElementById('timer-value');
    if (!timerEl) return;

    timerEl.textContent = this.gameTime;
    timerEl.classList.toggle('warning', this.gameTime <= 3);
  },

  endGame() {
    console.log('🏁 Fin du jeu!');

    this.stopGame();
    clearTimer(this.countdownTimer, 'interval');
    this.countdownTimer = null;

    const bgSound = document.getElementById('background-sound');
    bgSound?.pause();

    this.el.emit('game-ended');
    this.showEndMenu();
  },

  showEndMenu() {
    const endMenu = document.createElement('a-entity');
    endMenu.setAttribute('end-menu', {
      score: this.totalScore,
      hits: this.totalHits,
      arrows: this.totalArrowsShot,
    });
    this.el.appendChild(endMenu);
  },

  startTargetSpawning() {
    this.spawnTimer = setInterval(() => {
      if (this.activeTargets.length >= this.data.maxTargets) return;
      if (!this.hasAvailableSurface()) return;
      this.spawnRandomTarget();
    }, this.data.spawnInterval);
  },

  hasAvailableSurface() {
    // Check hit-test first
    if (this.sceneMeshHandler?.isHitTestActive()) {
      const detected = this.sceneMeshHandler.getDetectedSurface();
      if (detected?.isRealSurface) return true;
    }

    const surfaces = this.surfaceDetector?.surfaces;
    if (!surfaces) return false;

    const { horizontal = [], vertical = [] } = surfaces;
    const total = horizontal.length + vertical.length;
    if (total === 0) return false;
    if (!this.data.requireRealSurfaces) return true;

    return horizontal.some((s) => s.isRealSurface) || vertical.some((s) => s.isRealSurface);
  },

  calculateSpawnFromHitTest(detectedSurface) {
    const position = detectedSurface.position.clone
      ? detectedSurface.position.clone()
      : _position.set(detectedSurface.position.x, detectedSurface.position.y, detectedSurface.position.z).clone();
    const normal = detectedSurface.normal.clone
      ? detectedSurface.normal.clone()
      : _normal.set(detectedSurface.normal.x, detectedSurface.normal.y, detectedSurface.normal.z).clone();

    const isCeiling = normal.y <= -0.5;
    const isHorizontal = normal.y >= 0.5;
    let surfaceType = 'vertical';
    let rotation = { x: 0, y: 0, z: 0 };

    if (isHorizontal || isCeiling) {
      surfaceType = 'horizontal';
      position.addScaledVector(normal, isCeiling ? 0.6 : 0.5);

      const camera = this.el.sceneEl.camera;
      if (camera) {
        camera.getWorldPosition(_cameraPos);
        _tempObj.position.copy(position);
        _tempObj.lookAt(_cameraPos);
        rotation = { x: isCeiling ? 180 : 0, y: THREE.MathUtils.radToDeg(_tempObj.rotation.y), z: 0 };
      }
    } else {
      position.addScaledVector(normal, 0.2);
      const qAlign = new THREE.Quaternion().setFromUnitVectors(_negZ, normal.clone().normalize());
      const eAlign = new THREE.Euler().setFromQuaternion(qAlign, 'XYZ');
      rotation = {
        x: THREE.MathUtils.radToDeg(eAlign.x),
        y: THREE.MathUtils.radToDeg(eAlign.y),
        z: THREE.MathUtils.radToDeg(eAlign.z),
      };
    }

    return { position, rotation, surfaceType, isRealSurface: true, normal };
  },

  ensureFacingCamera(spawnData) {
    const camera = this.el.sceneEl.camera;
    if (!camera || !spawnData?.rotation) return;

    const position = spawnData.position instanceof THREE.Vector3
      ? spawnData.position
      : _position.set(spawnData.position.x, spawnData.position.y, spawnData.position.z);

    camera.getWorldPosition(_cameraPos);
    _toTarget.subVectors(_cameraPos, position).normalize();

    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(spawnData.rotation.x || 0),
      THREE.MathUtils.degToRad(spawnData.rotation.y || 0),
      THREE.MathUtils.degToRad(spawnData.rotation.z || 0),
      'YXZ',
    );

    _cameraForward.set(0, 0, -1).applyEuler(euler).normalize();
    const forwardPosZ = new THREE.Vector3(0, 0, 1).applyEuler(euler).normalize();

    if (_cameraForward.dot(_toTarget) < forwardPosZ.dot(_toTarget)) {
      spawnData.rotation.y = (spawnData.rotation.y || 0) + 180;
    } else if (_cameraForward.dot(_toTarget) < 0) {
      spawnData.rotation.y = (spawnData.rotation.y || 0) + 180;
    }
  },

  spawnRandomTarget() {
    let spawnData = null;

    // Try hit-test first
    if (this.sceneMeshHandler?.isHitTestActive()) {
      const detected = this.sceneMeshHandler.getDetectedSurface();
      if (detected) spawnData = this.calculateSpawnFromHitTest(detected);
    }

    // Fallback to surface-detector
    if (!spawnData && this.surfaceDetector) {
      spawnData = this.surfaceDetector.getRandomSpawnPoint();
    }

    if (!spawnData) return;

    // Validate distance & angle
    const camera = this.el.sceneEl.camera;
    const cameraPos = camera ? camera.getWorldPosition(_cameraPos) : _cameraPos.set(0, 1.6, 0);

    const pos = spawnData.position instanceof THREE.Vector3
      ? spawnData.position
      : _position.set(spawnData.position.x, spawnData.position.y, spawnData.position.z);

    const distance = pos.distanceTo(cameraPos);
    if (distance < MIN_SPAWN_DISTANCE || distance > MAX_SPAWN_DISTANCE) return;

    _toTarget.subVectors(pos, cameraPos).normalize();
    _cameraForward.set(0, 0, -1).applyQuaternion(camera?.quaternion || new THREE.Quaternion());
    const angle = Math.acos(_toTarget.dot(_cameraForward)) * (180 / Math.PI);
    const maxAngle = this.firstTargetSpawned ? 60 : 30;
    if (angle > maxAngle) return;

    this.ensureFacingCamera(spawnData);

    // Check minimum spacing from existing targets
    for (const existing of this.activeTargets) {
      if (!existing?.object3D) continue;
      if (existing.object3D.position.distanceTo(pos) < MIN_TARGET_SPACING) return;
    }

    // Difficulty settings
    const scale = 0.2 + Math.random() * 0.3;
    let { points, hp } = this.getDifficultyValues();

    if (spawnData.surfaceType === 'vertical') {
      points = Math.floor(points * VERTICAL_BONUS);
    }

    // Create target entity
    const target = document.createElement('a-entity');
    const targetId = `target-${Date.now()}`;
    target.id = targetId;
    target.setAttribute('position', pos);
    target.setAttribute('rotation', spawnData.rotation);
    target.setAttribute('scale', `${scale} ${scale} ${scale}`);
    target.setAttribute('surface-type', spawnData.surfaceType || 'random');
    target.setAttribute('static-body', { shape: 'cylinder', cylinderAxis: 'z' });
    target.setAttribute('target-behavior', { points, hp, movable: false });
    target.innerHTML = '<a-entity gltf-model="#target-model"></a-entity>';

    this.el.appendChild(target);
    this.activeTargets.push(target);
    this.firstTargetSpawned = true;

    if (this.useAnchors && this.anchorManager) {
      setTimeout(() => this.anchorTarget(target, pos, spawnData.rotation), 100);
    }

    console.log(`🎯 Nouvelle cible spawned: ${targetId} (${points}pts, ${hp}HP, ${spawnData.surfaceType})`);
  },

  getDifficultyValues() {
    const { difficulty } = this.data;
    if (difficulty === 'hard') {
      return { points: DIFFICULTY.hard.points, hp: Math.floor(Math.random() * DIFFICULTY.hard.maxHp) + 1 };
    }
    if (difficulty === 'normal') {
      return { points: DIFFICULTY.normal.points, hp: Math.random() > DIFFICULTY.normal.hpChance ? 2 : 1 };
    }
    return { points: DIFFICULTY.easy.points, hp: DIFFICULTY.easy.hp };
  },

  onTargetHit(evt) {
    const { points } = evt.detail;
    if (!points) return;

    this.totalHits++;
    this.totalScore += points;
    this.el.setAttribute('state', 'score', this.totalScore);
    this.updateScoreDisplay();
  },

  onTargetDestroyed(evt) {
    const { bonusPoints } = evt.detail;
    this.activeTargets = this.activeTargets.filter((t) => t.parentNode);

    if (bonusPoints > 0) {
      this.totalScore += bonusPoints;
      this.el.setAttribute('state', 'score', this.totalScore);
    }

    this.updateScoreDisplay();
  },

  onArrowShot() {
    this.totalArrowsShot++;
    console.log(`🏹 Flèches tirées: ${this.totalArrowsShot}`);
  },

  createScoreDisplay() {
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    hud.innerHTML = `
      <style>
        #game-hud {
          position: fixed;
          top: 20px;
          left: 20px;
          background: linear-gradient(135deg, #2d1b0e 0%, #4a3728 100%);
          border: 3px solid #d4af37;
          border-radius: 8px;
          padding: 15px 25px;
          font-family: 'Georgia', serif;
          color: #f4e4bc;
          z-index: 1000;
          pointer-events: none;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5), inset 0 0 20px rgba(0,0,0,0.3);
          min-width: 180px;
        }
        #game-hud .hud-title {
          text-align: center;
          font-size: 14px;
          color: #d4af37;
          border-bottom: 2px solid #d4af37;
          padding-bottom: 8px;
          margin-bottom: 12px;
          letter-spacing: 2px;
        }
        #game-hud .hud-timer {
          text-align: center;
          font-size: 42px;
          font-weight: bold;
          color: #fff;
          text-shadow: 0 0 10px rgba(212, 175, 55, 0.5);
          margin: 8px 0;
        }
        #game-hud .hud-timer-label {
          text-align: center;
          font-size: 12px;
          color: #d4af37;
          margin-bottom: 12px;
        }
        #game-hud .hud-timer.warning {
          color: #e74c3c;
          animation: pulse-warning 0.5s ease-in-out infinite;
        }
        @keyframes pulse-warning {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        #game-hud .hud-stat {
          display: flex;
          justify-content: space-between;
          margin: 6px 0;
          font-size: 16px;
        }
        #game-hud .hud-stat-label {
          color: #d4af37;
        }
        #game-hud .hud-stat-value {
          color: #fff;
          font-weight: bold;
        }
        #game-hud .hud-separator {
          height: 1px;
          background: linear-gradient(90deg, transparent, #d4af37, transparent);
          margin: 10px 0;
        }
      </style>
      <div class="hud-title">⚔️ CHASSE EN COURS ⚔️</div>
      <div class="hud-timer" id="timer-value">60</div>
      <div class="hud-timer-label">secondes restantes</div>
      <div class="hud-separator"></div>
      <div class="hud-stat">
        <span class="hud-stat-label">Butin :</span>
        <span class="hud-stat-value" id="score-value">0</span>
      </div>
      <div class="hud-stat">
        <span class="hud-stat-label">Cibles :</span>
        <span class="hud-stat-value" id="targets-value">0</span>
      </div>
    `;
    document.body.appendChild(hud);
  },

  updateScoreDisplay() {
    const scoreEl = document.getElementById('score-value');
    const targetsEl = document.getElementById('targets-value');
    if (scoreEl) scoreEl.textContent = this.totalScore;
    if (targetsEl) targetsEl.textContent = this.activeTargets.length;
  },

  async anchorTarget(target, position, rotation) {
    if (!this.anchorManager) return;

    try {
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(rotation.x || 0),
        THREE.MathUtils.degToRad(rotation.y || 0),
        THREE.MathUtils.degToRad(rotation.z || 0),
        'XYZ',
      );
      const quaternion = new THREE.Quaternion().setFromEuler(euler);

      const anchorId = await this.anchorManager.createAnchor({
        position: new THREE.Vector3(position.x, position.y, position.z),
        quaternion,
      });

      if (anchorId) this.anchorManager.attachToAnchor(target, anchorId);
    } catch (error) {
      console.log(`⚠️ Impossible d'ancrer la cible ${target.id}:`, error);
    }
  },

  stopGame() {
    this.gameRunning = false;
    clearTimer(this.spawnTimer, 'interval');
    this.spawnTimer = null;
    console.log('🎮 Jeu arrêté');
  },

  tick(time) {
    if (this.gameRunning && time % 1000 < 16) {
      this.updateScoreDisplay();
    }
  },
});
