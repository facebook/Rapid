import { geoChooseEdge } from '../geo/index.js';

export class SnapSystem {

	static GetLocationToSnapTo(eventData, context) {
		if (eventData == null) {
			return null;
		}

		const editor = context.systems.editor;
		const graph = editor.staging.graph;
		const viewport = context.viewport;
		const screenCoords = eventData.coord.map;
		const worldCoords = viewport.unproject(screenCoords);

		if (eventData.target != null) {
			const datum = eventData.target.data;

			if (datum != null) {
				const target = graph.hasEntity(datum.id);

				if (target != null) {

					if (target.type === 'node') {
						return {
							type: 'node',
							data: target,
							loc: target.loc,
							edge: null
						};
					}

					else if (target.type === 'way') {
						const result = SnapSystem._trySnapToWay(
							target, screenCoords, graph, viewport
						);

						if (result !== null) {
							return result;
						}
					}
				}
			}
		}

		// Free placement
		return {
			type: 'free',
			data: null,
			loc: worldCoords,
			edge: null
		};
	}


	static _trySnapToWay(way, screenCoords, graph, viewport) {
		const chosenEdge = geoChooseEdge(
			graph.childNodes(way),
			screenCoords,
			viewport
		);

		const maxSnapDistance = 20;

		if (chosenEdge == null) {
			return null;
		}

		if (chosenEdge.distance == null || chosenEdge.distance <= 0) {
			return null;
		}

		if (chosenEdge.distance >= maxSnapDistance) {
			return null;
		}

		const edge = [
			way.nodes[chosenEdge.index - 1],
			way.nodes[chosenEdge.index]
		];

		return {
			type: 'way',
			data: way,
			loc: chosenEdge.loc,
			edge: edge
		};
	}
}
