// controls.js — Camera, UI overlay, tooltips, minimap
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CityControls {
  constructor(camera, renderer, city, data) {
    this.camera = camera;
    this.renderer = renderer;
    this.city = city;
    this.data = data;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredBuilding = null;

    // Orbit controls
    this.orbit = new OrbitControls(camera, renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 10;
    this.orbit.maxDistance = 300;
    this.orbit.maxPolarAngle = Math.PI / 2.1;

    // Set initial camera position (isometric-ish overview)
    camera.position.set(150, 120, 150);
    this.orbit.target.set(100, 0, 100);

    // Create UI overlay
    this.createOverlay();

    // Event listeners
    renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  createOverlay() {
    // Top bar — use existing element from HTML
    const topBar = document.getElementById('top-bar');
    const starsText = this.data.stats?.stars ? ` · ⭐ ${this.formatNumber(this.data.stats.stars)}` : '';
    topBar.querySelector('.top-left').innerHTML = `
      <button class="back-btn" id="btn-back">← Back</button>
      <span class="city-name">${this.data.fullName || this.data.name || 'Code City'}</span>
      <span class="stat"><strong>${this.data.stats?.files || 0}</strong> buildings</span>
      <span class="stat"><strong>${this.formatNumber(this.data.stats?.loc || 0)}</strong> LOC</span>
      <span class="stat"><strong>${this.data.stats?.contributors || 0}</strong> devs${starsText}</span>
    `;
    topBar.querySelector('.top-right').innerHTML = `
      <button id="btn-toggle-fires" class="ctrl-btn" title="Toggle fires">🔥</button>
      <button id="btn-toggle-roads" class="ctrl-btn" title="Toggle roads">🛣️</button>
      <button id="btn-rocket" class="ctrl-btn" title="Launch rocket">🚀</button>
      <button id="btn-reset-cam" class="ctrl-btn" title="Reset camera">📷</button>
    `;

    document.getElementById('btn-back')?.addEventListener('click', () => location.reload());

    // Tooltip — use existing
    this.tooltip = document.getElementById('tooltip');

    // Legend
    const legend = document.getElementById('legend');
    const languages = this.data.stats?.languages || {};
    const topLangs = Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const langColors = {
      JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3572A5',
      Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', Ruby: '#701516',
      HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Svelte: '#ff3e00',
      Shell: '#89e051', 'C++': '#f34b7d', C: '#555555', PHP: '#4F5D95',
      javascript: '#f7df1e', typescript: '#3178c6', python: '#3572A5',
      rust: '#dea584', go: '#00ADD8', java: '#b07219', ruby: '#701516',
    };
    legend.innerHTML = `<div class="legend-title">Languages</div>` +
      topLangs.map(([lang, count]) =>
        `<div class="legend-item"><span class="legend-dot" style="background:${langColors[lang] || '#8b949e'}"></span>${lang} (${typeof count === 'number' && count > 1000 ? this.formatNumber(count) + ' bytes' : count})</div>`
      ).join('');

    // Activity feed
    const feed = document.getElementById('activity-feed');
    feed.innerHTML = '<div class="feed-title">Recent Commits</div>';
    const activities = (this.data.recent_activity || []).slice(0, 8);
    for (const a of activities) {
      const el = document.createElement('div');
      el.className = 'feed-item';
      el.innerHTML = `<span class="feed-author">${a.author}</span>: ${(a.message || a.type || '').slice(0, 50)}`;
      feed.appendChild(el);
    }
  }

  onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const building = this.city.getBuildingAt(this.raycaster);

    if (building) {
      this.hoveredBuilding = building;
      const d = building.userData;
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = event.clientX + 15 + 'px';
      this.tooltip.style.top = event.clientY + 15 + 'px';
      this.tooltip.innerHTML = `
        <div class="tt-name">${d.name}</div>
        <div class="tt-path">${d.path}</div>
        <div class="tt-row"><span>LOC:</span> <strong>${d.loc}</strong></div>
        <div class="tt-row"><span>Language:</span> <strong>${d.language}</strong></div>
        <div class="tt-row"><span>Churn:</span> <strong>${d.churn} edits</strong></div>
        <div class="tt-row"><span>Bugs:</span> <strong>${d.bug_count || 0}</strong></div>
        <div class="tt-row"><span>Author:</span> <strong>${d.last_author}</strong></div>
        ${d.is_test ? '<div class="tt-test">✅ Test file</div>' : ''}
        ${d.bug_count > 0 ? '<div class="tt-bug">🔥 Has bugs</div>' : ''}
      `;
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.hoveredBuilding = null;
      this.tooltip.style.display = 'none';
      this.renderer.domElement.style.cursor = 'default';
    }
  }

  onClick(event) {
    if (this.hoveredBuilding) {
      const pos = this.hoveredBuilding.position;
      const h = this.hoveredBuilding.userData.height || 5;
      // Smooth zoom to building
      this.animateCamera(pos.x + 5, h + 8, pos.z + 5, pos.x, h / 2, pos.z);
    }
  }

  animateCamera(px, py, pz, tx, ty, tz) {
    const startPos = this.camera.position.clone();
    const startTarget = this.orbit.target.clone();
    const endPos = new THREE.Vector3(px, py, pz);
    const endTarget = new THREE.Vector3(tx, ty, tz);
    let t = 0;

    const animate = () => {
      t += 0.02;
      if (t > 1) t = 1;
      const ease = t * t * (3 - 2 * t); // smoothstep

      this.camera.position.lerpVectors(startPos, endPos, ease);
      this.orbit.target.lerpVectors(startTarget, endTarget, ease);
      this.orbit.update();

      if (t < 1) requestAnimationFrame(animate);
    };
    animate();
  }

  onKeyDown(event) {
    if (event.key === 'r' || event.key === 'R') {
      this.animateCamera(150, 120, 150, 100, 0, 100);
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  update() {
    this.orbit.update();
  }

  formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  // Expose for external button binding
  bindButtons(effects) {
    document.getElementById('btn-toggle-fires')?.addEventListener('click', () => {
      effects.group.visible = !effects.group.visible;
    });
    document.getElementById('btn-toggle-roads')?.addEventListener('click', () => {
      this.city.roadGroup.visible = !this.city.roadGroup.visible;
    });
    document.getElementById('btn-rocket')?.addEventListener('click', () => {
      effects.launchRocket(100, 100);
    });
    document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
      this.animateCamera(150, 120, 150, 100, 0, 100);
    });
  }
}
