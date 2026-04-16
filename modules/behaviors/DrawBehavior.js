import { vecLength } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior.js';
import { utilDetect } from '../util/detect.js';
import { SnapSystem } from '../core/SnapSystem.js';

const NEAR_TOLERANCE = 4;
const FAR_TOLERANCE = 12;


/**
 * `DrawBehavior` listens to pointer and click events and translates those into drawing events.
 *
 * Properties available:
 *   `enabled`      `true` if the event handlers are enabled, `false` if not.
 *   `lastDown`     `eventData` Object for the most recent down event
 *   `lastMove`     `eventData` Object for the most recent move event
 *   `lastSpace`    `eventData` Object for the most recent spacebar-click move event
 *   `lastClick`    `eventData` Object for the most recent click event
 *
 * Events available:
 *   `move`    Fires on pointermove. Receives eventData with eventData.snapResult attached.
 *             All original eventData fields are unmodified.
 *             eventData.snapResult is the snap result from SnapSystem, or null if snap disabled.
 *   `click`   Fires on a successful click. Same shape as move.
 *   `down`    Fires on pointerdown. Receives original eventData.
 *   `cancel`  Fires on Delete/Backspace.
 *   `finish`  Fires on Enter/Escape.
 */
export class DrawBehavior extends AbstractBehavior {

	constructor(context) {
		super(context);
		this.id = 'draw';

		this._spaceClickDisabled = false;

		this.lastDown = null;
		this.lastMove = null;
		this.lastSpace = null;
		this.lastClick = null;

		this._doClick = this._doClick.bind(this);
		this._doMove = this._doMove.bind(this);
		this._keydown = this._keydown.bind(this);
		this._keyup = this._keyup.bind(this);
		this._pointercancel = this._pointercancel.bind(this);
		this._pointerdown = this._pointerdown.bind(this);
		this._pointermove = this._pointermove.bind(this);
		this._pointerup = this._pointerup.bind(this);
	}


	enable() {
		if (this._enabled) {
			return;
		}

		this._enabled = true;
		this.lastDown = null;
		this.lastMove = null;
		this.lastSpace = null;
		this.lastClick = null;
		this._spaceClickDisabled = false;

		const eventManager = this.context.systems.gfx.events;
		eventManager.on('keydown', this._keydown);
		eventManager.on('keyup', this._keyup);
		eventManager.on('modifierchange', this._doMove);
		eventManager.on('pointerover', this._doMove);
		eventManager.on('pointerout', this._doMove);
		eventManager.on('pointerdown', this._pointerdown);
		eventManager.on('pointermove', this._pointermove);
		eventManager.on('pointerup', this._pointerup);
		eventManager.on('pointercancel', this._pointercancel);
	}


	disable() {
		if (!this._enabled) {
			return;
		}

		this._enabled = false;
		this.lastDown = null;
		this.lastMove = null;
		this.lastSpace = null;
		this.lastClick = null;
		this._spaceClickDisabled = false;

		const eventManager = this.context.systems.gfx.events;
		eventManager.off('keydown', this._keydown);
		eventManager.off('keyup', this._keyup);
		eventManager.off('modifierchange', this._doMove);
		eventManager.off('pointerover', this._doMove);
		eventManager.off('pointerout', this._doMove);
		eventManager.off('pointerdown', this._pointerdown);
		eventManager.off('pointermove', this._pointermove);
		eventManager.off('pointerup', this._pointerup);
		eventManager.off('pointercancel', this._pointercancel);
	}


	_keydown(e) {
		if (['Enter', 'Escape', 'Esc'].includes(e.key)) {
			e.preventDefault();
			this.emit('finish');
		}
		else if (['Backspace', 'Delete', 'Del'].includes(e.key)) {
			e.preventDefault();
			this.emit('cancel');
		}
		else if (!this._spaceClickDisabled && [' ', 'Spacebar'].includes(e.key)) {
			e.preventDefault();
			e.stopPropagation();
			this._spacebar();
		}
	}


	_keyup(e) {
		if (this._spaceClickDisabled && [' ', 'Spacebar'].includes(e.key)) {
			e.preventDefault();
			e.stopPropagation();
			this._spaceClickDisabled = false;
		}
	}


	_pointerdown(e) {
		if (this.lastDown) {
			return;
		}

		const down = this._getEventData(e);
		this.lastDown = down;
		this.lastClick = null;
		this.emit('down', down);
	}


	_pointermove(e) {
		const move = this._getEventData(e);
		this.lastMove = move;

		if (this._spaceClickDisabled && this.lastSpace) {
			const dist = vecLength(move.coord.screen, this.lastSpace.coord.screen);
			if (dist > FAR_TOLERANCE) {
				this._spaceClickDisabled = false;
			}
		}

		const down = this.lastDown;
		if (down && !down.isCancelled && down.id === move.id) {
			const dist = vecLength(down.coord.screen, move.coord.screen);
			if (dist >= NEAR_TOLERANCE) {
				down.isCancelled = true;
			}
		}

		this._doMove();
	}


	_pointerup(e) {
		const down = this.lastDown;
		const up = this._getEventData(e);

		if (!down || down.id !== up.id) {
			return;
		}

		this.lastDown = null;

		if (down.isCancelled) {
			return;
		}

		const dist = vecLength(down.coord.screen, up.coord.screen);
		if (dist < NEAR_TOLERANCE || (dist < FAR_TOLERANCE && up.time - down.time < 500)) {
			this.lastClick = up;
			this._doClick();
		}
	}


	_pointercancel() {
		this.lastDown = null;
	}


	_spacebar() {
		if (this._spaceClickDisabled) {
			return;
		}
		if (!this.lastMove) {
			return;
		}

		this._spaceClickDisabled = true;
		this.lastSpace = this.lastMove;
		this.lastClick = this.lastMove;
		this._doClick();
	}


	_doMove() {
		if (!this._enabled || !this.lastMove) {
			return;
		}

		const context = this.context;
		const eventManager = context.systems.gfx.events;

		if (!eventManager.pointerOverRenderer) {
			return;
		}

		const modifiers = eventManager.modifierKeys;
		const isMac = utilDetect().os === 'mac';
		const disableSnap = modifiers.has('Alt') || modifiers.has('Meta') || (!isMac && modifiers.has('Control'));

		// Shallow-copy eventData so we can attach snapResult without mutating lastMove
		const eventData = Object.assign({}, this.lastMove);
		eventData.snapResult = null;

		if (!disableSnap) {
			eventData.snapResult = SnapSystem.GetLocationToSnapTo(this.lastMove, context);
		}

		this.emit('move', eventData);
	}


	_doClick() {
		if (!this._enabled || !this.lastClick) {
			return;
		}

		const context = this.context;
		const eventManager = context.systems.gfx.events;
		const modifiers = eventManager.modifierKeys;
		const isMac = utilDetect().os === 'mac';
		const disableSnap = modifiers.has('Alt') || modifiers.has('Meta') || (!isMac && modifiers.has('Control'));

		// Shallow-copy eventData so we can attach snapResult without mutating lastClick.
		// Use lastMove as the snap source — it has the correct Pixi target state.
		// lastClick comes from pointerup whose raw Pixi target may differ.
		const eventData = Object.assign({}, this.lastClick);
		eventData.snapResult = null;

		const snapSource = this.lastMove || this.lastClick;

		if (!disableSnap && snapSource) {
			eventData.snapResult = SnapSystem.GetLocationToSnapTo(
				snapSource,
				context,
			);
		}

		this.emit('click', eventData);
	}
}
