import * as THREE from 'three';
import { voxelize, type PixelSource, type Rect, type VoxelizeOptions } from './voxelize';

/** World units per source pixel: one 16px PD tile spans one world unit. */
export const PIXEL = 1 / 16;

const geometryCache = new Map<string, THREE.BufferGeometry>();

export function voxelGeometry(key: string, src: PixelSource, rect: Rect, opts?: VoxelizeOptions): THREE.BufferGeometry {
  const cacheKey = `${key}|${rect.x},${rect.y},${rect.w},${rect.h}|${opts?.maxDepth ?? ''}`;
  let geo = geometryCache.get(cacheKey);
  if (!geo) {
    const data = voxelize(src, rect, opts);
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.scale(PIXEL, PIXEL, PIXEL);
    geo.computeBoundingSphere();
    geometryCache.set(cacheKey, geo);
  }
  return geo;
}
