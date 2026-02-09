# Instructions Copilot pour SAE 4.02 - Archery XR

## Vue d'ensemble du projet

Jeu de tir à l'arc immersif en WebXR utilisant A-Frame, transformant l'environnement réel du joueur en zone de combat. Le joueur utilise deux manettes VR (Meta Quest) pour bander un arc virtuel et tirer des flèches sur des cibles spawned dynamiquement. Thème visuel **médiéval** appliqué à toute l'interface (menus, HUD, landing page).

## 🔍 Règle obligatoire : Vérification avec Context7

**IMPORTANT** : Avant d'utiliser ou de recommander toute fonctionnalité, bibliothèque ou pattern, **toujours vérifier avec Context7** :

- ✅ **Vérifier les versions à jour** des bibliothèques (A-Frame, aframe-physics-system, etc.)
- ✅ **Valider les bonnes pratiques** actuelles de l'écosystème A-Frame
- ✅ **Confirmer les APIs modernes** et les fonctions disponibles
- ✅ **S'assurer de l'utilisation des dernières fonctionnalités** WebXR
- ✅ **Vérifier la syntaxe correcte** des composants et systèmes

### IDs Context7 du projet

```bash
# A-Frame (framework principal)
/aframevr/aframe

# Physique A-Frame (static-body sur cibles/surfaces)
/c-frame/aframe-physics-system

# A-Frame Extras
/c-frame/aframe-extras
```

**Ne jamais** implémenter de code basé sur des suppositions ou des versions obsolètes. Toujours valider avec Context7 en premier.

## Architecture ECS (Entity-Component-System)

### Composants (`src/components/`)

1. **bow-logic.js** — Laser de visée & tir simple (desktop/VR fallback)
   - Crée un `aimGuide` (THREE.Object3D) pour corriger la direction de visée
   - Affiche un laser vert (cylindre THREE.js) attaché au guide
   - Raycaster pour détecter les cibles (`[target-behavior]`) et afficher un curseur d'impact rouge
   - Tir via `triggerdown` / `abuttondown` sur la main droite
   - Fallback desktop : tir au clic souris (hors mode VR)
   - Instancie des flèches avec `arrow-physics` (vitesse configurable via `arrowSpeed`, défaut 45)
   - Émet `arrow-shot` sur la scène à chaque tir

2. **bow-draw-system.js** — Mécanique VR de bandage d'arc (composant principal)
   - Attaché au rig (`#rig`), coordonne les deux mains
   - **Snap distance** : la main droite doit être à < 0.2m de la gauche pour accrocher la corde
   - Calcule la **distance de tirage** entre les mains (min 0.12m, max 0.45m)
   - Vitesse de flèche proportionnelle : `minArrowSpeed: 8` → `maxArrowSpeed: 80`
   - Indicateur visuel : ligne verte→rouge + sphère sur la main droite
   - Applique une **compensation de rotation** (Euler -90° X) pour corriger l'orientation
   - Événements écoutés : `triggerdown`/`triggerup` et `abuttondown`/`abuttonup` sur main droite
   - Son de grincement de corde au snap, son de tir + sifflement au relâchement
   - Émet `arrow-shot` sur la scène

3. **bow-string.js** — Corde d'arc animée en Three.js
   - Crée un tube (TubeGeometry) suivant une CatmullRomCurve3 de 20 segments
   - Points d'ancrage configurables : `topAnchor`, `bottomAnchor` (vec3)
   - Rotation locale configurable via `rotation` (vec3 en degrés)
   - Au repos : courbe de Bézier quadratique avec léger offset vers l'avant (`restOffset: 0.08`)
   - En tirage : le point milieu suit la position de la main droite
   - Reconstruit la géométrie du tube à chaque `tick()` (coordonnées monde)
   - Se connecte automatiquement à `bow-draw-system` pour l'état de tirage

4. **arrow-physics.js** — Simulation physique manuelle des flèches (PAS d'Ammo.js)
   - **Physique custom** : gravité, masse, résistance de l'air calculées dans `tick()`
   - Schema : `speed: 45`, `gravity: 0.005`, `mass: 0.001`, `dragCoefficient: 0.0005`
   - Calcul vélocité : `v = v + a * dt`, déplacement : `s = v * dt`
   - Orientation automatique de la flèche dans la direction de sa vélocité
   - **Collision par raycasting** : lance un rayon dans la direction du mouvement
   - Exclut les éléments HUD (attribut `hud-element`) de la détection
   - Vérifie les menus VR (`vr-menu`, `end-menu`) via `checkArrowHit()`
   - À l'impact : plante la flèche, appelle `target-behavior.onArrowHit()`
   - Suppression animée (scale → 0) après 5s, lifetime max 8s
   - Modèle 3D : `fleche.glb`

5. **target-behavior.js** — Cibles avec scoring de précision
   - Calcul de précision via `worldToLocal()` puis distance au centre en XY
   - **4 zones** : `bullseye` (x3, ≤ 0.1m), `middle` (x2, ≤ 0.3m), `outer` (x1, ≤ 0.5m), `edge` (x0.5)
   - Système de HP (configurable) avec destruction à 0 HP
   - Protection contre le double-hit via `hitByArrows` Set
   - Animations : scale bounce au hit, rotation + shrink à la destruction
   - Cibles mobiles : mouvement oscillant via `setInterval` (sin/cos)
   - Émet `target-hit` (points, zone, multiplier, position, surfaceType)
   - Émet `target-destroyed` (bonusPoints = 50% du dernier hit)
   - Son de hit (`hit-sound`) joué à chaque impact

6. **scene-mesh-handler.js** — Détection de surfaces WebXR
   - Utilise **WebXR Hit Test API** (pas Scene Understanding/mesh-detection)
   - Initialise un `hitTestSource` via `requestHitTestSource()` (viewer space, fallback local)
   - Stocke les 3 dernières surfaces détectées
   - Fournit `getDetectedSurface()` : position, rotation, normal, type (horizontal/vertical)
   - `isHitTestActive()` : vérifie si le hit-test est fonctionnel (timeout 30s)
   - `createAnchor()` / `deleteAnchor()` : gestion WebXR Anchors
   - **Fallback mock** : 3 surfaces simulées (mur droit, mur gauche, sol) avec `static-body`
   - Émet `scene-mesh-handler-ready`, `surface-detected`, `scene-mesh-updated`

7. **surface-detector.js** — Classification et validation des surfaces
   - Écoute `surface-detected` du scene-mesh-handler
   - Classifie en `horizontal` (normal.y > 0.7) ou `vertical`
   - Validation : distance max (10m), aire min (0.25m²), stabilité (3 frames)
   - Historique de stabilité avec expiration (3s)
   - API de spawn : `getRandomSpawnPoint()`, `getRandomHorizontalSpawnPoint()`, `getRandomVerticalSpawnPoint()`
   - Oriente les cibles face à la caméra
   - Émet `surfaces-detected` avec compteurs (horizontal, vertical, real, mock)

8. **webxr-anchor-manager.js** — Gestion du cycle de vie des anchors WebXR
   - Max 30 anchors simultanés (FIFO si dépassement)
   - `createAnchor(pose)` → retourne anchorId
   - `attachToAnchor(entity, anchorId)` → lie une entité à un anchor
   - `updateEntityFromAnchor()` → synchronise position/rotation depuis anchor XR
   - Auto-cleanup configurable (défaut 5s) : supprime les entités orphelines
   - Se connecte au `scene-mesh-handler` pour la création d'anchors
   - Émet `anchor-created`, `anchor-manager-ready`

9. **score-hud.js** — HUD VR médiéval (attaché à la caméra)
   - Créé au `start-game`, caché au `game-ended`
   - Panneau bois/or avec timer (gros chiffre central) et score
   - Timer pulsant rouge quand ≤ 3 secondes
   - Flash vert sur le score à chaque hit
   - Utilise l'attribut `hud-element` pour exclure les collisions flèches
   - Lit le score et le timer depuis le système `game-manager`

10. **vr-menu.js** — Menu de démarrage VR médiéval
    - Panneau flottant à position (0, 1.5, -2.5)
    - Sections : titre "ARCHERY XR", Quête, Contrôles, Récompenses
    - Bouton cible 3D pulsant ("TIREZ POUR COMMENCER")
    - Interaction par flèche : `checkArrowHit(arrowPosition)` (rayon 0.5m)
    - Émet `start-game` quand touché
    - Animation de disparition (scale → 0) puis suppression du DOM

11. **end-menu.js** — Menu de fin de partie médiéval
    - Affiche score final, touches, flèches tirées, précision (%)
    - Bouton cible vert "NOUVELLE QUÊTE" avec interaction flèche
    - Sur replay : supprime cibles, flèches, HUD → recrée un `vr-menu`
    - Support du clic VR classique + hover (raycast/cursor)

### Systèmes (`src/systems/`)

1. **game-manager.js** — Système central de jeu (`AFRAME.registerSystem`)
   - **Timer** : 60 secondes de jeu, countdown chaque seconde
   - **Spawn** : toutes les 500ms, max 3 cibles actives
   - **Difficulté** : easy / normal / hard (points et HP variables)
   - Bonus +20% points pour les surfaces verticales
   - Taille des cibles variable (scale 0.2 à 0.5)
   - Contrôles de spawn : angle max (30° premier / 60° ensuite), distance 1.5-10m, espacement 0.5m min
   - Utilise `surface-detector` + `scene-mesh-handler` pour le positionnement
   - `ensureFacingCamera()` : oriente les cibles vers le joueur
   - Support anchors WebXR (`anchorTarget()`)
   - Double HUD : overlay HTML (2D) + score-hud VR (3D)
   - Musique de fond (`background-sound`) volume 0.3
   - Lifecycle : `start-game` → jeu → `game-ended` → `end-menu`
   - Écoute `target-hit`, `target-destroyed`, `arrow-shot`
   - Met à jour le `state` component (score, gameStarted)

2. **combo-system.js** — Système de combos (`AFRAME.registerSystem`)
   - Timeout combo : 2 secondes entre hits
   - Multiplicateur : +20% par combo, max 5x
   - Bonus bullseye : +1 combo supplémentaire
   - Feedback 3D : texte flottant élastique (COMBO / SUPER COMBO / MEGA COMBO)
   - Animation manuelle via `requestAnimationFrame`
   - Met à jour le `state` (combo, multiplier)
   - Tracking : `currentCombo`, `maxCombo`, `multiplier`
   - Le multiplicateur **n'est pas** appliqué au score par le combo-system (le game-manager gère le scoring)

## Stack Technique

### Bibliothèques (package.json)
- **A-Frame ^1.7.1** : Framework WebXR — dernière version stable est 1.7.1
- **aframe-physics-system ^4.0.2** : Utilisé uniquement pour `static-body` sur cibles et surfaces mock (pas sur les flèches)
- **aframe-state-component ^7.1.1** : Gestion réactive de l'état global (`score`, `combo`, `multiplier`, `gameStarted`)
- **aframe-extras ^7.6.1** : Animations et utilitaires (importé mais peu utilisé directement)
- **aframe-environment-component ^1.5.0** : Environnements prédéfinis (importé mais non utilisé dans la scène actuelle)
- **Vite ^7.2.4** : Build tool avec plugin `@vitejs/plugin-basic-ssl` pour HTTPS (requis par WebXR)

### Configuration Vite
```javascript
// HTTPS obligatoire pour WebXR, host 0.0.0.0 pour accès réseau (Quest)
{
  plugins: [basicSsl()],
  server: { https: true, host: '0.0.0.0', port: 5173 }
}
```

### Physique : Custom vs Ammo.js
**IMPORTANT** : Les flèches n'utilisent **PAS** Ammo.js. La physique des projectiles est entièrement custom dans `arrow-physics.js` :
- Gravité, masse et drag simulés manuellement dans `tick()`
- Collisions détectées par **raycasting THREE.js** (pas de collision bodies)
- `static-body` (aframe-physics-system) utilisé uniquement pour :
  - Les cibles (`static-body="shape: cylinder; cylinderAxis: z"`)
  - Les surfaces mock du scene-mesh-handler (`static-body="shape: box"`)

### Fonctionnalités WebXR utilisées
- **Hand Tracking** : `requiredFeatures: hand-tracking` dans le composant webxr
- **Hit Test API** : Détection de surfaces réelles via `requestHitTestSource()`
- **WebXR Anchors** : Ancrage spatial persistant des cibles (optionalFeatures: anchors)
- **Mesh Detection** : Listé dans optionalFeatures mais non implémenté activement
- **DOM Overlay** : Listé dans optionalFeatures
- **Depth Sensing** : Listé dans optionalFeatures
- **Reference Space** : `local` (pas `local-floor`)

### Assets 3D et Audio
```
public/
├── arc_sanslacorde.glb   # Modèle d'arc (sans corde, la corde est en Three.js)
├── arrow.glb             # Modèle de flèche (asset)
├── bow.glb               # Modèle d'arc alternatif (non utilisé)
├── fleche.glb            # Modèle de flèche (utilisé par arrow-physics)
├── target.glb            # Modèle de cible
├── vite.svg              # Favicon
└── son/
    ├── arrow.mp3         # Son d'impact (hit-sound)
    ├── Fleche.wav         # Son de sifflement en vol (arrow-fly-sound)
    ├── grincement_fleche.mp3  # Son de corde tendue (bow-creak-sound)
    ├── song-background.mp3    # Musique de fond (background-sound)
    └── tir_arc.mp3       # Son de tir (shoot-sound)
```

## Structure HTML (index.html)

### Configuration de la scène
```html
<a-scene
  state="score: 0; gameStarted: false"
  webxr="referenceSpaceType: local;
         requiredFeatures: hand-tracking;
         optionalFeatures: hit-test,anchors,mesh-detection,layers,depth-sensing,dom-overlay;"
  renderer="colorManagement: true; physicallyCorrectLights: true; alpha: true; antialias: true;"
  game-manager
>
```

### Hiérarchie des entités du joueur
```
#rig (position: 0 1.6 0, bow-draw-system)
├── a-camera (score-hud)
├── #leftHand (hand-controls=left, meta-touch-controls=left, bow-string, raycaster, laser-controls)
│   └── gltf-model: #bow-model (arc_sanslacorde.glb, scale 0.25, rotation 0 90 90)
└── #rightHand (hand-controls=right, meta-touch-controls=right, raycaster, laser-controls)
```

### Entités de la scène
- Lumières : ambient (intensity 1.0) + directional (intensity 0.8)
- `scene-mesh-handler` : détection surfaces WebXR
- `surface-detector` : classification surfaces pour spawn
- `webxr-anchor-manager` : anchors WebXR
- `vr-menu` : menu de démarrage
- 2 cibles initiales (`target-1`, `target-2`) à -5m et -6m

### Overlays HTML
- **Landing screen** : écran d'accueil médiéval (caché après lancement)
- **Bouton XR** : "ENTRER EN XR" (priorité AR > VR)
- **Debug panel** : FPS, gamepads, erreurs (monkey-patched console.error)
- **Game HUD** : overlay HTML médiéval (timer, score, cibles) créé par game-manager

## Patterns et Conventions

### Physique des flèches (arrow-physics.js)
```javascript
// Simulation manuelle dans tick()
const dt = deltaTime / 1000;
const gravityAcc = new THREE.Vector3(0, -this.data.gravity, 0);

// Drag (résistance de l'air)
const dragForce = velocity.clone().normalize()
  .multiplyScalar(-dragCoefficient * velocityMagnitude * velocityMagnitude);
const dragAcc = dragForce.divideScalar(mass);

// Mise à jour : a = gravity + drag, v += a*dt, pos += v*dt
this.velocity.add(this.acceleration.clone().multiplyScalar(dt));
const displacement = this.velocity.clone().multiplyScalar(dt);

// Orientation automatique vers la direction du mouvement
const targetQuaternion = new THREE.Quaternion();
targetQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), velocity.normalized);
this.el.object3D.quaternion.copy(targetQuaternion);

// Collision par raycasting dans la direction du déplacement
this.raycaster.set(currentPos, rayDir);
this.raycaster.far = Math.max(rayDistance * 1.2, 0.001);
```

### Calcul de précision (target-behavior.js)
```javascript
const localImpact = this.el.object3D.worldToLocal(impactPoint.clone());
const distanceToCenter = Math.sqrt(localImpact.x ** 2 + localImpact.y ** 2);

if (distanceToCenter <= 0.1) { multiplier = 3.0; zone = 'bullseye'; }
else if (distanceToCenter <= 0.3) { multiplier = 2.0; zone = 'middle'; }
else if (distanceToCenter <= 0.5) { multiplier = 1.0; zone = 'outer'; }
else { multiplier = 0.5; zone = 'edge'; }
```

### Mécanique de tir VR (bow-draw-system.js)
```javascript
// 1. Main droite trigger → vérifier distance des mains
const distance = leftHand.distanceTo(rightHand);
if (distance < snapDistance) { isDrawing = true; }

// 2. Pendant le tirage : calculer la puissance
const drawRatio = Math.min(drawDistance / maxDrawDistance, 1);
const arrowSpeed = minSpeed + (maxSpeed - minSpeed) * drawRatio;

// 3. Au relâchement : tirer avec rotation compensée
const compensationEuler = new THREE.Euler(degToRad(-90), 0, 0, 'XYZ');
aimQuaternion.multiply(compensationQuaternion);
```

### État global (aframe-state-component)
```html
<a-scene state="score: 0; gameStarted: false">
```
```javascript
// Mise à jour depuis un système
this.el.setAttribute('state', 'score', newScore);
this.el.setAttribute('state', 'gameStarted', true);
```

### Flux d'événements
```
[vr-menu] ──→ "start-game" ──→ [game-manager.startGame()]
                                  ├── Crée HUD HTML + score-hud VR
                                  ├── Lance spawning (500ms)
                                  └── Lance countdown (60s)

[bow-draw-system] ──→ "arrow-shot" ──→ [game-manager.onArrowShot()]

[arrow-physics] ──collision──→ [target-behavior.onArrowHit()]
                                  └── "target-hit" ──→ [game-manager.onTargetHit()]
                                                       [combo-system.onTargetHit()]
                                                       [score-hud.onScoreUpdate()]

[target-behavior.destroy()] ──→ "target-destroyed" ──→ [game-manager.onTargetDestroyed()]

[game-manager.endGame()] ──→ "game-ended" ──→ [score-hud.hideHUD()]
                              └── Crée end-menu

[end-menu.onReplayClick()] ──→ Nettoie tout ──→ Crée nouveau vr-menu
```

### Interaction menus par flèches
Les menus VR n'utilisent **pas** le raycaster/cursor classique d'A-Frame. Les flèches vérifient manuellement dans leur `tick()` si elles touchent les boutons des menus :
```javascript
// Dans arrow-physics.js tick()
const startMenuEl = this.el.sceneEl.querySelector("[vr-menu]");
if (startMenuEl?.components["vr-menu"]?.checkArrowHit(worldPos)) {
  this.hasCollided = true;
  this.removeArrow();
  return;
}
```

## Gameplay Loop complet

1. **Landing** : écran médiéval + bouton XR
2. **Entrée XR** : mode AR (préféré) ou VR, menu VR affiché
3. **Menu VR** : instructions + cible "TIREZ POUR COMMENCER"
4. **Start** : joueur tire une flèche sur le bouton → `start-game`
5. **Jeu** : 60 secondes, cibles apparaissent toutes les 500ms (max 3)
6. **Tir** : rapprocher mains → trigger → tirer → relâcher → flèche en vol
7. **Collision** : raycasting détecte cible → calcul précision → score + combo
8. **Destruction** : cible à 0 HP → animation → bonus → despawn
9. **Fin** : timer à 0 → musique stop → HUD caché → menu fin affiché
10. **Replay** : tirer sur "NOUVELLE QUÊTE" → tout réinitialiser → retour au menu

## Points d'attention pour le développement

### Performances VR
- **Max 3 cibles actives** (configurable via `maxTargets`)
- Lifetime des flèches : 8s max, suppression animée après 5s plantée
- Reconstruire la géométrie de la corde à chaque frame (coûteux, surveiller)
- `static-body` sur les cibles pour les collisions de physique
- Nettoyer les entités via `parentNode.removeChild()`
- Les `setInterval` des cibles mobiles doivent être clear au `remove()`

### Exclusion HUD des collisions
L'attribut `hud-element` sur un élément ou parent empêche les flèches de le détecter :
```javascript
// arrow-physics.js vérifie la hiérarchie
let current = mesh;
while (current && current !== scene) {
  if (current.hasAttribute('hud-element')) { isHudElement = true; break; }
  current = current.parentNode;
}
```

### Debugging
- Debug panel HTML avec FPS, erreurs, console.error monkey-patché
- Console logs avec emojis : 🏹 arc, 🎯 cible, 💥 collision, 🔥 combo, ➡️ flèche, ⚓ anchor
- `physics="debug: true"` pour visualiser les collision shapes des static-body

### WebXR Testing
- **HTTPS obligatoire** (plugin basic-ssl de Vite)
- Utiliser WebXR Emulator extension pour Chrome/Edge
- Tester sur **Meta Quest 3** pour le Hit Test réel et les anchors
- Accès réseau : `https://<IP>:5173` (host: 0.0.0.0)
- Fallback desktop : clic souris pour tirer (via `bow-logic.js`)
- Le mode AR est prioritaire sur le mode VR dans le bouton XR

### Contrôleurs supportés
- **Meta Touch Controls** (`meta-touch-controls`)
- **Hand Controls** générique (`hand-controls`)
- **Laser Controls** (`laser-controls`) pour le raycast
- Événements utilisés : `triggerdown`, `triggerup`, `abuttondown`, `abuttonup`

## Prochaines fonctionnalités

- [ ] Power-ups (flèches explosives, multi-cibles)
- [ ] Modes de jeu additionnels (survie, précision)
- [ ] Effets sonores spatialisés (positional audio)
- [ ] Leaderboards en ligne
- [ ] Intégration réelle du mesh-detection WebXR (Scene Understanding)
- [ ] Appliquer le multiplicateur combo au scoring
- [ ] Effets de particules aux impacts
- [ ] Différents types de cibles (mouvantes rapides, bonus, malus)

## Commandes utiles

```bash
npm run dev        # Serveur HTTPS local (https://localhost:5173)
npm run build      # Build de production
npm run preview    # Prévisualiser le build
```

## Ressources

- [A-Frame Documentation](https://aframe.io/docs/) — Version 1.7.1
- [aframe-physics-system](https://github.com/c-frame/aframe-physics-system) — Ammo.js driver docs
- [WebXR Device API](https://www.w3.org/TR/webxr/)
- [WebXR Hit Test](https://immersive-web.github.io/hit-test/)
- [WebXR Anchors](https://immersive-web.github.io/anchors/)
- [THREE.js Documentation](https://threejs.org/docs/)

---

**Note pour Copilot** : Ce projet utilise une architecture ECS stricte. Toujours créer des composants réutilisables plutôt que du code inline. Privilégier les **événements** pour la communication entre composants/systèmes. Le thème visuel est **médiéval** (bois sombre, or, parchemin) — respecter cette charte dans tout nouveau composant UI.

**RAPPEL CRITIQUE** : Avant toute implémentation, modification ou recommandation, **utiliser Context7** pour :
1. Vérifier que les bibliothèques sont à jour
2. Confirmer que les fonctions/APIs existent dans la version utilisée
3. Valider les bonnes pratiques actuelles de l'écosystème
4. S'assurer de l'utilisation des dernières fonctionnalités disponibles
5. Vérifier la syntaxe et les patterns recommandés

Ne jamais se fier uniquement à la mémoire ou aux connaissances générales. Context7 est la source de vérité.
