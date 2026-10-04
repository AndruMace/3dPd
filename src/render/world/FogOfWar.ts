// PD's FogOfWar as a 32x32 texture sampled in world space by every terrain material. Linear filtering gives the
// same soft edges the original got from scaling its fog texture.
import * as THREE from 'three';
import { HEIGHT, LENGTH, WIDTH } from '../../engine/levels/constants';

// Original overlay colors (ARGB): VISIBLE 0x00000000, VISITED 0xcc111111, MAPPED 0xcc442211, INVISIBLE 0xFF000000.
const VISITED = [0x11, 0x11, 0x11, 0xcc];
const MAPPED = [0x44, 0x22, 0x11, 0xcc];
const INVISIBLE = [0, 0, 0, 0xff];
const VISIBLE = [0, 0, 0, 0];

export class FogOfWar {
  readonly texture: THREE.DataTexture;
  private readonly data = new Uint8Array(LENGTH * 4);
  /** Latest visible map the view has applied. */
  visible: Uint8Array = new Uint8Array(LENGTH);

  constructor() {
    this.texture = new THREE.DataTexture(this.data, WIDTH, HEIGHT, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.update(new Uint8Array(LENGTH), new Uint8Array(LENGTH), new Uint8Array(LENGTH));
  }

  update(visible: Uint8Array, visited: Uint8Array, mapped: Uint8Array): void {
    this.visible = visible;
    for (let i = 0; i < LENGTH; i++) {
      const c = visible[i] ? VISIBLE : visited[i] ? VISITED : mapped[i] ? MAPPED : INVISIBLE;
      this.data.set(c, i * 4);
    }
    this.texture.needsUpdate = true;
  }
}

export interface WorldUniforms {
  uFog: { value: THREE.Texture };
  uHero: { value: THREE.Vector3 };
  /** Horizontal unit vector from the camera towards the hero. */
  uViewDir: { value: THREE.Vector2 };
  uCutHeight: { value: number };
}

export function createWorldUniforms(fog: FogOfWar): WorldUniforms {
  return {
    uFog: { value: fog.texture },
    uHero: { value: new THREE.Vector3() },
    uViewDir: { value: new THREE.Vector2(0, -1) },
    uCutHeight: { value: 0.18 },
  };
}

/**
 * Adds fog-of-war (and optionally the wall cut-away) to a built-in material. Geometry must provide aCell and
 * aCut when `cutaway` is on.
 */
export function applyWorldShader(material: THREE.Material, uniforms: WorldUniforms, cutaway: boolean): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        uniform vec3 uHero;
        uniform vec2 uViewDir;
        uniform float uCutHeight;
        ${cutaway ? 'attribute vec2 aCell; attribute float aCut;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${
          cutaway
            ? `
        if (aCut > 0.5) {
          vec4 cellW = modelMatrix * vec4(aCell.x, 0.0, aCell.y, 1.0);
          vec2 d = cellW.xz - uHero.xz;
          float along = dot(d, uViewDir);
          float lateral = abs(d.x * uViewDir.y - d.y * uViewDir.x);
          // Walls between the camera and the hero shrink to a stub.
          float cut = (1.0 - smoothstep(-0.2, 0.6, along)) * smoothstep(-3.6, -2.6, along) * (1.0 - smoothstep(1.6, 2.4, lateral));
          // Door panels (aCut 2) only come down to half height so they stay recognisable.
          float cutH = aCut > 1.5 ? 0.5 : uCutHeight;
          if (transformed.y > cutH) transformed.y = mix(transformed.y, cutH, cut);
        }`
            : ''
        }`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWorldPos;
        uniform sampler2D uFog;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        vec4 fogC = texture2D(uFog, vec2(vWorldPos.x, vWorldPos.z) / ${WIDTH.toFixed(1)});
        gl_FragColor.rgb = gl_FragColor.rgb * (1.0 - fogC.a) + fogC.rgb;`,
      );
  };
  material.customProgramCacheKey = () => (cutaway ? 'world-cut' : 'world');
}
