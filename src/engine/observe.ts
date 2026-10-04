import { Dungeon } from './Dungeon';
import { Events } from './core/events';
import { LENGTH } from './levels/constants';

/** Port of Dungeon.observe(): recompute the hero's view and remember what was seen. */
export function observe(): void {
  const level = Dungeon.level;
  if (!level) return;
  level.updateFieldOfView(Dungeon.hero);
  Dungeon.visible.set(level.fieldOfView);
  for (let i = 0; i < LENGTH; i++) if (Dungeon.visible[i]) level.visited[i] = 1;
  Events.emit({
    type: 'observe',
    visible: Dungeon.visible.slice(),
    visited: level.visited.slice(),
    mapped: level.mapped.slice(),
  });
}
