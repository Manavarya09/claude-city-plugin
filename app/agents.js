// agents.js — Animated Claude agent sprites walking between buildings
import * as THREE from 'three';

const AGENT_COLORS = ['#7aa2f7', '#9ece6a', '#f7768e', '#e0af68', '#bb9af7', '#7dcfff'];
const AGENT_SIZE = 1.5;
const MOVE_SPEED = 5;

export class AgentManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.agents = [];
    this.group = new THREE.Group();
    this.scene.add(this.group);
  }

  createAgent(id, name, targetFile) {
    const colorIndex = this.agents.length % AGENT_COLORS.length;
    const color = new THREE.Color(AGENT_COLORS[colorIndex]);

    // Agent body (simple capsule shape)
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);

    // Head
    const headGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffeedd });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.9;

    // Label
    const label = this.createLabel(name || `Agent ${id}`, color);
    label.position.y = 1.8;

    // Status text
    const status = this.createLabel('idle', new THREE.Color(0x888888));
    status.position.y = 1.4;
    status.scale.set(3, 0.8, 1);

    const agentGroup = new THREE.Group();
    agentGroup.add(body);
    agentGroup.add(head);
    agentGroup.add(label);
    agentGroup.add(status);

    // Glow ring under feet
    const ringGeo = new THREE.RingGeometry(0.5, 0.7, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    agentGroup.add(ring);

    // Start at random position
    const startX = Math.random() * 100 + 50;
    const startZ = Math.random() * 100 + 50;
    agentGroup.position.set(startX, 0.6, startZ);

    this.group.add(agentGroup);

    const agent = {
      id,
      name,
      mesh: agentGroup,
      body,
      ring,
      statusSprite: status,
      target: null,
      path: [],
      pathIndex: 0,
      speed: MOVE_SPEED + Math.random() * 2,
      bobPhase: Math.random() * Math.PI * 2,
      color: AGENT_COLORS[colorIndex]
    };

    if (targetFile) {
      this.setTarget(agent, targetFile);
    }

    this.agents.push(agent);
    return agent;
  }

  setTarget(agent, filePath) {
    const building = this.city.buildings.find(b => b.data.path === filePath);
    if (!building) return;

    const pos = building.mesh.position;
    agent.target = { x: pos.x + 2, z: pos.z + 2 };
    agent.pathIndex = 0;

    // Simple path: current pos → target
    const current = agent.mesh.position;
    agent.path = [
      { x: current.x, z: current.z },
      { x: pos.x + 2, z: current.z }, // Walk horizontally first
      { x: pos.x + 2, z: pos.z + 2 }  // Then vertically
    ];
  }

  setStatus(agentId, text) {
    const agent = this.agents.find(a => a.id === agentId);
    if (!agent) return;
    // Update status label
    this.group.remove(agent.statusSprite);
    const newStatus = this.createLabel(text, new THREE.Color(0xaaaaaa));
    newStatus.position.y = 1.4;
    newStatus.scale.set(4, 0.8, 1);
    agent.mesh.add(newStatus);
    agent.statusSprite = newStatus;
  }

  createLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = color instanceof THREE.Color ? `#${color.getHexString()}` : '#ffffff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text.slice(0, 24), 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    return sprite;
  }

  update(time, delta) {
    for (const agent of this.agents) {
      // Walk along path
      if (agent.path.length > 0 && agent.pathIndex < agent.path.length) {
        const target = agent.path[agent.pathIndex];
        const pos = agent.mesh.position;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.5) {
          agent.pathIndex++;
        } else {
          const step = Math.min(agent.speed * delta, dist);
          pos.x += (dx / dist) * step;
          pos.z += (dz / dist) * step;

          // Face movement direction
          agent.mesh.rotation.y = Math.atan2(dx, dz);
        }
      } else if (Math.random() < 0.002) {
        // Random walk when idle
        const buildings = this.city.buildings;
        if (buildings.length > 0) {
          const randomBuilding = buildings[Math.floor(Math.random() * buildings.length)];
          this.setTarget(agent, randomBuilding.data.path);
        }
      }

      // Bob animation
      agent.bobPhase += delta * 5;
      agent.body.position.y = Math.abs(Math.sin(agent.bobPhase)) * 0.15;

      // Pulse ring
      agent.ring.material.opacity = 0.2 + 0.2 * Math.sin(time * 2 + agent.bobPhase);
      agent.ring.rotation.z += delta * 0.5;
    }
  }

  removeAgent(id) {
    const index = this.agents.findIndex(a => a.id === id);
    if (index !== -1) {
      this.group.remove(this.agents[index].mesh);
      this.agents.splice(index, 1);
    }
  }
}
