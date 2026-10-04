// Port of com.watabou.utils.Graph: room-graph distance maps and paths used by level generation.

export interface GraphNode {
  distance: number;
  price: number;
  edges(): Iterable<GraphNode>;
}

export const Graph = {
  setPrice(nodes: Iterable<GraphNode>, value: number): void {
    for (const node of nodes) node.price = value;
  },

  buildDistanceMap(nodes: Iterable<GraphNode>, focus: GraphNode): void {
    for (const node of nodes) node.distance = Number.MAX_SAFE_INTEGER;
    const queue: GraphNode[] = [focus];
    focus.distance = 0;
    while (queue.length) {
      const node = queue.shift()!;
      const distance = node.distance;
      const price = node.price;
      for (const edge of node.edges()) {
        if (edge.distance > distance + price) {
          queue.push(edge);
          edge.distance = distance + price;
        }
      }
    }
  },

  buildPath<T extends GraphNode>(from: T, to: T): T[] | null {
    const path: T[] = [];
    let room = from;
    while (room !== to) {
      let min = room.distance;
      let next: T | null = null;
      for (const edge of room.edges()) {
        if (edge.distance < min) {
          min = edge.distance;
          next = edge as T;
        }
      }
      if (!next) return null;
      path.push(next);
      room = next;
    }
    return path;
  },
};
