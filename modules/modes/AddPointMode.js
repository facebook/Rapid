import { AbstractMode } from './AbstractMode.js';

import { actionAddEntity } from '../actions/add_entity.js';
import { actionChangeTags } from '../actions/change_tags.js';
import { actionAddMidpoint } from '../actions/add_midpoint.js';
import { osmNode } from '../osm/node.js';
import { actionMoveNode } from '../actions/move_node.js';

const DEBUG = false;


export class AddPointMode extends AbstractMode {

	constructor(context) {
		super(context);
		this.id = 'add-point';

		this.defaultTags = {};

		this._click = this._click.bind(this);
		this._cancel = this._cancel.bind(this);
		this._onCursorMovement = this._onCursorMovement.bind(this);

		this._previewNodeID = null;
		this._lastSnapResult = null;
	}


	enter() {
		if (DEBUG) {
			console.log('AddPointMode: entering');
		}

		const context = this.context;
		const editor = context.systems.editor;
		const map = context.systems.map;

		this._active = true;
		this._previewNodeID = null;
		this._lastSnapResult = null;

		const startLoc = map.mouseLoc();
		const previewNode = osmNode({ loc: startLoc, tags: this.defaultTags });

		editor.perform(actionAddEntity(previewNode));
		this._previewNodeID = previewNode.id;

		// Mark the preview node with the 'drawing' class so the Pixi renderer
		// treats it as non-interactive. Without this, the preview node sits on
		// top of ways and intercepts Pixi hit tests, preventing way snapping.
		// DrawLineMode uses the same approach for its temporary draw node.
		const gfx = context.systems.gfx;
		const layer = gfx.scene.layers.get('osm');
		if (layer) {
			layer.setClass('drawing', previewNode.id);
		}

		const eventManager = context.systems.gfx.events;
		eventManager.setCursor('crosshair');

		context.enableBehaviors(['hover', 'draw', 'mapInteraction']);

		context.behaviors.draw
			.on('click', this._click)
			.on('cancel', this._cancel)
			.on('finish', this._cancel)
			.on('move', this._onCursorMovement);

		return true;
	}


	exit() {
		if (!this._active) {
			return;
		}

		this._active = false;

		if (DEBUG) {
			console.log('AddPointMode: exiting');
		}

		const context = this.context;
		const editor = context.systems.editor;
		const eventManager = context.systems.gfx.events;

		eventManager.setCursor('grab');

		const gfx = context.systems.gfx;
		const layer = gfx.scene.layers.get('osm');
		if (layer) {
			layer.clearClass('drawing');
		}

		context.behaviors.draw
			.off('click', this._click)
			.off('cancel', this._cancel)
			.off('finish', this._cancel)
			.off('move', this._onCursorMovement);

		// _previewNodeID is null if _click already handled cleanup.
		// Only revert if the user cancelled — preview node still in staging.
		if (this._previewNodeID !== null) {
			this._previewNodeID = null;
			this._lastSnapResult = null;
			editor.revert();
		}
	}


	_onCursorMovement(eventData) {
		if (this._previewNodeID === null) {
			return;
		}

		const context = this.context;
		const editor = context.systems.editor;

		// Cache snap result for use in _click
		this._lastSnapResult = eventData.snapResult;

		let worldLoc = null;

		if (eventData.snapResult !== null && eventData.snapResult !== undefined) {
			// snapResult.loc is world coords from SnapSystem
			worldLoc = eventData.snapResult.loc;
		}
		else {
			worldLoc = context.viewport.unproject(eventData.coord.map);
		}

		editor.perform(actionMoveNode(this._previewNodeID, worldLoc));
		context.systems.gfx.immediateRedraw();
	}


	_click(eventData) {
		const context = this.context;
		const editor = context.systems.editor;

		// Use snap from click event, fall back to last cached move snap
		const snap = eventData.snapResult || this._lastSnapResult;

		// Null out before revert so exit() skips the revert
		this._previewNodeID = null;
		this._lastSnapResult = null;

		// Revert wipes the preview node from staging.
		// Stable is untouched — previously committed nodes are safe.
		editor.revert();

		if (snap !== null) {
			if (snap.type === 'way') {
				this._placeOnWay(snap.loc, snap.edge);
				return;
			}

			if (snap.type === 'node') {
				this._placeOnNode(snap.data);
				return;
			}
		}

		// Free placement
		const freeLoc = snap ? snap.loc : context.viewport.unproject(eventData.coord.map);
		this._placeFree(freeLoc);
	}


	_placeFree(loc) {
		const context = this.context;
		const editor = context.systems.editor;
		const l10n = context.systems.l10n;

		const node = osmNode({ loc: loc, tags: this.defaultTags });
		editor.perform(actionAddEntity(node));
		editor.commit({
			annotation: l10n.t('operations.add.annotation.point'),
			selectedIDs: [node.id]
		});

		context.enter('select-osm', {
			selection: { osm: [node.id] },
			newFeature: true
		});
	}


	_placeOnWay(loc, edge) {
		const context = this.context;
		const editor = context.systems.editor;
		const l10n = context.systems.l10n;

		const node = osmNode({ tags: this.defaultTags });
		editor.perform(actionAddMidpoint({ loc: loc, edge: edge }, node));
		editor.commit({
			annotation: l10n.t('operations.add.annotation.vertex'),
			selectedIDs: [node.id]
		});

		context.enter('select-osm', {
			selection: { osm: [node.id] },
			newFeature: true
		});
	}


	_placeOnNode(existingNode) {
		const context = this.context;
		const editor = context.systems.editor;
		const l10n = context.systems.l10n;

		if (Object.keys(this.defaultTags).length === 0) {
			context.enter('select-osm', {
				selection: { osm: [existingNode.id] },
				newFeature: false
			});
			return;
		}

		const tags = Object.assign({}, existingNode.tags);

		for (const k in this.defaultTags) {
			tags[k] = this.defaultTags[k];
		}

		editor.perform(actionChangeTags(existingNode.id, tags));
		editor.commit({
			annotation: l10n.t('operations.add.annotation.point'),
			selectedIDs: [existingNode.id]
		});

		context.enter('select-osm', {
			selection: { osm: [existingNode.id] },
			newFeature: false
		});
	}


	_cancel() {
		// exit() will revert since _previewNodeID is still set
		this.context.enter('browse');
	}
}
