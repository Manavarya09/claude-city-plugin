// city.js — Bright daytime NYC-style city with high performance
import * as THREE from 'three';

const CITY_SIZE = 250;
const ROAD_GAP = 0.5;
const MAX_HEIGHT = 50;
const MIN_HEIGHT = 0.5;

// NYC building palette
const BUILDING_COLORS = [
  0xc8cdd0, // concrete grey
  0xb0b8bf, // steel grey
  0x8faabe, // glass blue
  0x6b9ac4, // sky blue glass
  0xd4c5a9, // sandstone
  0xc2b280, // beige
  0xa89070, // brownstone
  0xe0ddd5, // white concrete
  0x9aabb8, // blue steel
  0xbfc9ce, // light grey
];

// Blue-to-red gradient for risk heatmap (0.0 = low risk blue, 1.0 = high risk red)
function riskColor(churn, bugCount, loc) {
  const safeLoc = Math.max(loc || 1, 1);
  const score = ((churn || 0) * (bugCount || 0)) / safeLoc;
  const t = Math.min(score / 2, 1); // normalize — score of 2+ maps to max red
  const r = Math.round(60 + t * 195);
  const g = Math.round(60 + (1 - Math.abs(t - 0.5) * 2) * 100);
  const b = Math.round(200 - t * 170);
  return (r << 16) | (g << 8) | b;
}

export class City {
  constructor(scene, data) {
    this.scene = scene;
    this.data = data;
    this.buildings = [];
    this.buildingGroup = new THREE.Group();
    this.labelGroup = new THREE.Group();
    this.roadGroup = new THREE.Group();

    this.scene.add(this.buildingGroup);
    this.scene.add(this.labelGroup);
    this.scene.add(this.roadGroup);
  }

  build() {
    const files = this.flattenFiles(this.data.tree);
    if (files.length === 0) return;

    const maxLoc = Math.max(...files.map(f => f.metrics?.loc || 1), 100);

    const layout = this.computeTreemap(this.data.tree, 0, 0, CITY_SIZE, CITY_SIZE);

    this.createGround();

    // Build all real buildings as individual meshes (for color variety + raycasting)
    for (const item of layout) {
      if (item.type === 'file') {
        this.createBuilding(item, maxLoc);
      } else if (item.type === 'district') {
        this.createDistrict(item);
      }
    }

    // Filler buildings (merged for performance)
    this.generateFillerBuildings(layout);

    // Roads
    this.createRoads(layout);
  }

  createBuilding(item, maxLoc) {
    const loc = item.metrics?.loc || 1;
    const height = MIN_HEIGHT + (loc / maxLoc) * MAX_HEIGHT;
    const { x, z, w, d } = item.layout;

    const bw = Math.max(w - ROAD_GAP, 0.4);
    const bd = Math.max(d - ROAD_GAP, 0.4);

    // Pick color based on language
    const langColors = {
      typescript: 0x6b9ac4, javascript: 0xe8c840, python: 0x5a8fa8,
      rust: 0xc8855a, go: 0x5abfcf, java: 0xb07830,
      ruby: 0xa85050, css: 0x9070b8, html: 0xd06030,
      shell: 0x80b850, json: 0x60c088, markdown: 0x8090b0,
      default: BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)]
    };
    const color = langColors[item.metrics?.language] || langColors.default;

    // Main building
    const geo = new THREE.BoxGeometry(bw, height, bd);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.2,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Metadata
    mesh.userData = {
      type: 'building',
      name: item.name,
      path: item.path,
      loc: item.metrics?.loc,
      language: item.metrics?.language,
      churn: item.metrics?.churn,
      bug_count: item.metrics?.bug_count,
      last_author: item.metrics?.last_author,
      is_test: item.metrics?.is_test,
      age_days: item.metrics?.age_days,
      height
    };

    this.buildingGroup.add(mesh);
    this.buildings.push({ mesh, data: item, position: mesh.position, height });

    // Rooftop detail on taller buildings
    if (height > 10 && Math.random() > 0.3) {
      const roofW = bw * (0.2 + Math.random() * 0.3);
      const roofD = bd * (0.2 + Math.random() * 0.3);
      const roofH = 1 + Math.random() * 3;
      const roofGeo = new THREE.BoxGeometry(roofW, roofH, roofD);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x667788, roughness: 0.6, metalness: 0.3 });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(x, height + roofH / 2, z);
      roof.castShadow = true;
      this.buildingGroup.add(roof);
    }

    // Antenna on skyscrapers
    if (height > 30 && Math.random() > 0.5) {
      const antGeo = new THREE.CylinderGeometry(0.06, 0.06, height * 0.25, 4);
      const antMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
      const ant = new THREE.Mesh(antGeo, antMat);
      ant.position.set(x, height + height * 0.125, z);
      this.buildingGroup.add(ant);
    }
  }

  generateFillerBuildings(layout) {
    const occupied = new Set();

    for (const item of layout) {
      if (item.type === 'file' && item.layout) {
        const gx = Math.floor(item.layout.x / 2.5);
        const gz = Math.floor(item.layout.z / 2.5);
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++)
            occupied.add(`${gx + dx},${gz + dz}`);
      }
    }

    const gridSize = 2.5;
    const gridCount = Math.floor(CITY_SIZE / gridSize);
    let count = 0;
    const maxFillers = 1500;

    // Merge filler geos for performance
    const geos = [];

    for (let gx = 1; gx < gridCount - 1; gx++) {
      for (let gz = 1; gz < gridCount - 1; gz++) {
        if (count >= maxFillers) break;
        if (occupied.has(`${gx},${gz}`)) continue;
        if (Math.random() > 0.45) continue;

        const x = gx * gridSize + (Math.random() - 0.5);
        const z = gz * gridSize + (Math.random() - 0.5);
        const w = 0.8 + Math.random() * 1.5;
        const d = 0.8 + Math.random() * 1.5;

        // Height: mostly low-rise, some mid, rare tall
        let h = 1 + Math.random() * 4;
        if (Math.random() > 0.7) h += Math.random() * 12;
        if (Math.random() > 0.95) h += Math.random() * 25;

        const geo = new THREE.BoxGeometry(w, h, d);
        geo.translate(x, h / 2, z);
        geos.push(geo);

        occupied.add(`${gx},${gz}`);
        count++;
      }
      if (count >= maxFillers) break;
    }

    // Merge into single mesh
    if (geos.length > 0) {
      const merged = this.mergeGeometries(geos);
      const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
      const mat = new THREE.MeshStandardMaterial({
        color: 0xb8bfc8,
        roughness: 0.5,
        metalness: 0.15,
      });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.buildingGroup.add(mesh);
    }
  }

  mergeGeometries(geos) {
    let totalVerts = 0, totalIdx = 0;
    for (const g of geos) {
      totalVerts += g.attributes.position.count;
      totalIdx += g.index ? g.index.count : g.attributes.position.count;
    }

    const pos = new Float32Array(totalVerts * 3);
    const norm = new Float32Array(totalVerts * 3);
    const idx = new Uint32Array(totalIdx);
    let vOff = 0, iOff = 0;

    for (const g of geos) {
      const gPos = g.attributes.position;
      const gNorm = g.attributes.normal;
      for (let i = 0; i < gPos.count; i++) {
        pos[(vOff + i) * 3] = gPos.getX(i);
        pos[(vOff + i) * 3 + 1] = gPos.getY(i);
        pos[(vOff + i) * 3 + 2] = gPos.getZ(i);
        if (gNorm) {
          norm[(vOff + i) * 3] = gNorm.getX(i);
          norm[(vOff + i) * 3 + 1] = gNorm.getY(i);
          norm[(vOff + i) * 3 + 2] = gNorm.getZ(i);
        }
      }
      if (g.index) {
        for (let i = 0; i < g.index.count; i++) idx[iOff + i] = g.index.getX(i) + vOff;
        iOff += g.index.count;
      } else {
        for (let i = 0; i < gPos.count; i++) idx[iOff + i] = vOff + i;
        iOff += gPos.count;
      }
      vOff += gPos.count;
      g.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    merged.setIndex(new THREE.BufferAttribute(idx.slice(0, iOff), 1));
    merged.computeVertexNormals();
    return merged;
  }

  computeTreemap(nodes, x, y, w, h) {
    const result = [];
    if (!nodes || nodes.length === 0) return result;

    const getValue = (node) => {
      if (node.type === 'file') return Math.max(node.metrics?.loc || 1, 1);
      if (node.children) return node.children.reduce((s, c) => s + getValue(c), 0);
      return 1;
    };

    const totalValue = nodes.reduce((s, n) => s + getValue(n), 0);
    if (totalValue === 0) return result;

    const sorted = [...nodes].sort((a, b) => getValue(b) - getValue(a));
    let remaining = [...sorted];
    let rx = x + ROAD_GAP, ry = y + ROAD_GAP;
    let rw = w - ROAD_GAP * 2, rh = h - ROAD_GAP * 2;

    while (remaining.length > 0) {
      const horizontal = rw >= rh;
      const row = [];
      let rowValue = 0;
      const totalRemaining = remaining.reduce((s, n) => s + getValue(n), 0);

      for (let i = 0; i < remaining.length; i++) {
        row.push(remaining[i]);
        rowValue += getValue(remaining[i]);
        if (rowValue / totalRemaining > 0.4 && row.length > 1) break;
        if (row.length >= Math.ceil(Math.sqrt(remaining.length))) break;
      }

      remaining = remaining.slice(row.length);
      const rowFraction = rowValue / totalRemaining;
      const rowSize = horizontal ? rw * rowFraction : rh * rowFraction;

      let offset = 0;
      const crossSize = horizontal ? rh : rw;

      for (const node of row) {
        const fraction = getValue(node) / rowValue;
        const itemSize = crossSize * fraction;
        const ix = horizontal ? rx : rx + offset;
        const iy = horizontal ? ry + offset : ry;
        const iw = horizontal ? rowSize : itemSize;
        const ih = horizontal ? itemSize : rowSize;

        if (node.type === 'file') {
          result.push({
            type: 'file', ...node,
            layout: { x: ix + iw / 2, z: iy + ih / 2, w: Math.max(iw, 0.5), d: Math.max(ih, 0.5) }
          });
        } else if (node.type === 'directory' && node.children) {
          result.push({ type: 'district', name: node.name, path: node.path, layout: { x: ix, z: iy, w: iw, d: ih } });
          result.push(...this.computeTreemap(node.children, ix, iy, iw, ih));
        }
        offset += itemSize;
      }

      if (horizontal) { rx += rowSize; rw -= rowSize; }
      else { ry += rowSize; rh -= rowSize; }
    }
    return result;
  }

  createGround() {
    // Asphalt ground
    const groundGeo = new THREE.PlaneGeometry(CITY_SIZE + 80, CITY_SIZE + 80);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x404850,
      roughness: 0.9,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CITY_SIZE / 2, -0.01, CITY_SIZE / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  createDistrict(item) {
    const { x, z, w, d } = item.layout;

    // District road lines
    const points = [
      new THREE.Vector3(x, 0.05, z),
      new THREE.Vector3(x + w, 0.05, z),
      new THREE.Vector3(x + w, 0.05, z + d),
      new THREE.Vector3(x, 0.05, z + d),
      new THREE.Vector3(x, 0.05, z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.15 });
    this.roadGroup.add(new THREE.Line(geo, mat));

    if (w > 8 && d > 8) {
      const label = this.createLabel(item.name, x + w / 2, 0.3, z + d / 2);
      this.labelGroup.add(label);
    }
  }

  createLabel(text, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 64);
    ctx.fillStyle = '#556677';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text.toUpperCase().slice(0, 20), 256, 40);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.6 });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(10, 1.3, 1);
    return sprite;
  }

  createRoads(layout) {
    const filePositions = {};
    for (const item of layout) {
      if (item.type === 'file' && item.layout) filePositions[item.path] = item.layout;
    }
    const deps = (this.data.dependencies || []).slice(0, 200);
    const mat = new THREE.LineBasicMaterial({ color: 0x889999, transparent: true, opacity: 0.1 });

    for (const dep of deps) {
      const from = filePositions[dep.from];
      const to = filePositions[dep.to];
      if (!from || !to) continue;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(from.x, 0.2, from.z),
        new THREE.Vector3((from.x + to.x) / 2, 2, (from.z + to.z) / 2),
        new THREE.Vector3(to.x, 0.2, to.z)
      );
      this.roadGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(12)), mat));
    }
  }

  setColorMode(mode) {
    this.colorMode = mode;
    const langColors = {
      typescript: 0x6b9ac4, javascript: 0xe8c840, python: 0x5a8fa8,
      rust: 0xc8855a, go: 0x5abfcf, java: 0xb07830,
      ruby: 0xa85050, css: 0x9070b8, html: 0xd06030,
      shell: 0x80b850, json: 0x60c088, markdown: 0x8090b0,
    };
    for (const b of this.buildings) {
      const d = b.mesh.userData;
      let color;
      if (mode === 'heatmap') {
        color = riskColor(d.churn, d.bug_count, d.loc);
      } else {
        color = langColors[d.language] || BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];
      }
      b.mesh.material.color.setHex(color);
    }
  }

  update(time) {
    // Nothing heavy — keep it smooth
  }

  getBuildingAt(raycaster) {
    const intersects = raycaster.intersectObjects(this.buildingGroup.children, false);
    for (const hit of intersects) {
      if (hit.object.userData?.type === 'building') return hit.object;
    }
    return null;
  }

  flattenFiles(nodes, result = []) {
    if (!nodes) return result;
    for (const node of nodes) {
      if (node.type === 'file') result.push(node);
      else if (node.children) this.flattenFiles(node.children, result);
    }
    return result;
  }
}
