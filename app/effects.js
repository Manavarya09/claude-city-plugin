// effects.js — Bright daytime NYC atmosphere: sun, blue sky, clouds, soft shadows
import * as THREE from 'three';

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.fires = [];
    this.sparkles = [];
    this.rockets = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  createAtmosphere() {
    // Sunset sky
    this.scene.background = new THREE.Color(0xf0a070);

    // Warm ambient
    const ambient = new THREE.AmbientLight(0xffeedd, 0.5);
    this.scene.add(ambient);

    // Golden hour sun — low angle, warm orange
    const sun = new THREE.DirectionalLight(0xffaa66, 1.4);
    sun.position.set(200, 50, 100); // Low angle for long shadows
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    // Cool fill from shadow side (blue-purple)
    const fill = new THREE.DirectionalLight(0x6688cc, 0.25);
    fill.position.set(-80, 60, -50);
    this.scene.add(fill);

    // Hemisphere: warm sky + cool ground bounce
    const hemi = new THREE.HemisphereLight(0xffccaa, 0x445566, 0.35);
    this.scene.add(hemi);

    // Warm sunset fog
    this.scene.fog = new THREE.Fog(0xe8a878, 120, 400);
  }

  // --- Fire (bugs) ---
  addFire(x, y, z, intensity = 1) {
    const count = Math.floor(20 * intensity);
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = x + (Math.random() - 0.5) * 1.5;
      positions[i * 3 + 1] = y + Math.random();
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * 1.5;
      velocities.push({ vy: 1.5 + Math.random() * 3, life: Math.random() });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5, color: 0xff4400, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);

    const light = new THREE.PointLight(0xff3300, 2 * intensity, 10);
    light.position.set(x, y + 1, z);
    this.group.add(light);

    this.fires.push({ points, light, baseX: x, baseY: y, baseZ: z, velocities, count });
  }

  // --- Sparkles (new features) ---
  addSparkle(x, y, z) {
    const count = 15;
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      velocities.push({
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 3, life: Math.random()
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.4, color: 0x00cc66, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    this.sparkles.push({ points, baseX: x, baseY: y, baseZ: z, velocities, count, time: 0 });
  }

  // --- Rockets ---
  launchRocket(x, z) {
    const rocketGeo = new THREE.ConeGeometry(0.4, 1.5, 6);
    const rocketMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const rocket = new THREE.Mesh(rocketGeo, rocketMat);
    rocket.position.set(x, 0, z);

    const trailCount = 40;
    const trailPos = new Float32Array(trailCount * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.PointsMaterial({
      size: 0.5, color: 0xff8800, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const trail = new THREE.Points(trailGeo, trailMat);

    this.group.add(rocket);
    this.group.add(trail);
    this.rockets.push({
      mesh: rocket, trail, y: 0, speed: 20,
      baseX: x, baseZ: z, trailPositions: trailPos,
      trailIndex: 0, trailCount, alive: true
    });
  }

  // --- Update ---
  update(time, delta) {
    // Fires
    for (const fire of this.fires) {
      const pos = fire.points.geometry.attributes.position.array;
      for (let i = 0; i < fire.count; i++) {
        const v = fire.velocities[i];
        v.life += delta;
        if (v.life > 1) {
          pos[i * 3] = fire.baseX + (Math.random() - 0.5) * 1.5;
          pos[i * 3 + 1] = fire.baseY;
          pos[i * 3 + 2] = fire.baseZ + (Math.random() - 0.5) * 1.5;
          v.life = 0;
        } else {
          pos[i * 3 + 1] += v.vy * delta;
          pos[i * 3] += (Math.random() - 0.5) * delta * 2;
        }
      }
      fire.points.geometry.attributes.position.needsUpdate = true;
      fire.light.intensity = 1.5 + Math.sin(time * 8) * 0.8;
    }

    // Sparkles
    for (const s of this.sparkles) {
      s.time += delta;
      const pos = s.points.geometry.attributes.position.array;
      for (let i = 0; i < s.count; i++) {
        const v = s.velocities[i];
        v.life += delta;
        if (v.life > 2) {
          pos[i * 3] = s.baseX; pos[i * 3 + 1] = s.baseY; pos[i * 3 + 2] = s.baseZ;
          v.life = 0; v.vy = 2 + Math.random() * 4;
        } else {
          pos[i * 3] += v.vx * delta;
          pos[i * 3 + 1] += v.vy * delta;
          pos[i * 3 + 2] += v.vz * delta;
          v.vy -= 4 * delta;
        }
      }
      s.points.geometry.attributes.position.needsUpdate = true;
    }

    // Rockets
    for (const r of this.rockets) {
      if (!r.alive) continue;
      r.y += r.speed * delta;
      r.mesh.position.y = r.y;
      const tp = r.trailPositions;
      const idx = (r.trailIndex % r.trailCount) * 3;
      tp[idx] = r.baseX + (Math.random() - 0.5) * 0.5;
      tp[idx + 1] = r.y - 0.5;
      tp[idx + 2] = r.baseZ + (Math.random() - 0.5) * 0.5;
      r.trailIndex++;
      r.trail.geometry.attributes.position.needsUpdate = true;
      if (r.y > 100) {
        this.group.remove(r.mesh);
        this.group.remove(r.trail);
        r.alive = false;
      }
    }
  }

  addBugFires(buildings) {
    for (const b of buildings) {
      if (b.data.metrics?.bug_count > 0 && b.position) {
        this.addFire(b.position.x, b.height, b.position.z, Math.min(b.data.metrics.bug_count / 2, 2));
      }
    }
  }

  addNewFeatureSparkles(buildings) {
    for (const b of buildings) {
      if (b.data.metrics?.age_days < 3 && b.position) {
        this.addSparkle(b.position.x, b.height + 1, b.position.z);
      }
    }
  }
}
