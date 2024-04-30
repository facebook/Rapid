/* eslint-disable linebreak-style */
import { uiTooltip } from '../tooltip.js';
import { uiSection } from '../section.js';
import { uiCmd } from '../cmd.js';

export function uiSectionFocusModes(context) {
    const styles = context.systems.styles;
    const l10n = context.systems.l10n;

    const section = uiSection(context, 'focus-modes')
        .label(l10n.t('preferences.focus_modes.title'))
        .disclosureContent(renderDisclosureContent);

    const FOCUS_OPTIONS = ['default', 'pedestrian'];

    function renderDisclosureContent(selection) {
        let container = selection.selectAll('.focus-mode-options')
            .data([0]);

        // Enter
        const enter = container.enter()
            .append('div')
            .attr('class', 'focus-mode-options');

        enter
            .append('ul')
            .attr('class', 'layer-list focus-mode-options-list');

        // Update
        container
            .merge(enter)
            .selectAll('.focus-mode-options-list')
            .call(drawListItems);
    }


    function drawListItems(selection) {
        let items = selection.selectAll('li')
            .data(FOCUS_OPTIONS);

        // Exit
        items.exit()
            .remove();

        // Enter
        let enter = items.enter()
            .append('li')
            .call(uiTooltip(context)
                .title(d => l10n.t(`preferences.focus_modes.${d}.tooltip`))
                .placement('top')
            );

        let label = enter
            .append('label');

        label
            .append('input')
            .attr('type', 'radio')
            .attr('name', 'focus_modes')
            .on('change', setFocusMode);

        label
            .append('span')
            .text(d => l10n.t(`preferences.focus_modes.${d}.title`));

        // Update
        items = items
            .merge(enter);

        update();

        function update() {
            items
                .classed('active', isModeActive)
                .selectAll('input')
                .property('checked', isModeActive)
                .property('indeterminate', false);
        }

        const preferenceKey = l10n.t('preferences.key');

        context.keybinding()
            .on(uiCmd('⌥' + preferenceKey), e => {
                e.preventDefault();
                e.stopPropagation();

                const currMode = styles.getMode();
                const newMode = currMode === 'default' ? 'pedestrian' : 'default';
                setFocusMode(null, newMode);
                update();
            });
    }


    function isModeActive(d) {
        const curr = styles.getMode();
        return curr === d;
    }

    function setFocusMode(d3_event, d) {
        if (styles.focusMode !== d) {
            styles.setMode(d);
            context.scene().dirtyScene();
            context.systems.map.deferredRedraw();
        }
    }

    return section;
}
