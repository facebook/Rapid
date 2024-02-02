describe('utilKeybinding', function() {
    var keybinding, spy, input;

    beforeEach(function () {
        keybinding = Rapid.utilKeybinding('keybinding-test');
        spy = sinon.spy();
        input = d3.select('body')
            .append('input');
    });

    afterEach(function () {
        d3.select(document).call(keybinding.unbind);
        input.remove();
    });

    describe('#on', function () {
        it('returns self', function () {
            expect(keybinding.on('a', spy)).to.equal(keybinding);
        });

        it('adds a binding for the specified bare key', function () {
            d3.select(document).call(keybinding.on('A', spy));

            happen.keydown(document, {keyCode: 65, metaKey: true});
            expect(spy.notCalled).to.be.ok;

            happen.keydown(document, {keyCode: 65});
            expect(spy.calledOnce).to.be.ok;
        });

        it('adds a binding for the specified key combination', function () {
            d3.select(document).call(keybinding.on('⌘+A', spy));

            happen.keydown(document, {keyCode: 65});
            expect(spy.notCalled).to.be.ok;

            happen.keydown(document, {keyCode: 65, metaKey: true});
            expect(spy.calledOnce).to.be.ok;
        });

        it('matches the binding even when shift is present', function () {
            d3.select(document).call(keybinding.on('A', spy));

            happen.keydown(document, {keyCode: 65, shiftKey: true});
            expect(spy.calledOnce).to.be.ok;
        });

        it('matches shifted bindings before unshifted bindings', function () {
            var spy2 = sinon.spy();
            d3.select(document).call(keybinding.on('A', spy2));
            d3.select(document).call(keybinding.on('⇧A', spy));

            happen.keydown(document, {keyCode: 65, shiftKey: true});
            expect(spy.calledOnce).to.be.ok;
            expect(spy2.notCalled).to.be.ok;
        });

        it('ignores alt and control if both are present (e.g. as AltGr) #4096', function () {
            d3.select(document).call(keybinding.on('A', spy));

            happen.keydown(document, {keyCode: 65, altKey: true, ctrlKey: true});
            expect(spy.calledOnce).to.be.ok;
        });

        it('adds multiple bindings given an array of keys', function () {
            d3.select(document).call(keybinding.on(['A','B'], spy));

            happen.keydown(document, {keyCode: 65});
            expect(spy.calledOnce).to.be.ok;

            happen.keydown(document, {keyCode: 66});
            expect(spy.calledTwice).to.be.ok;
        });

        it('does not dispatch when focus is in input elements by default', function () {
            d3.select(document).call(keybinding.on('A', spy));

            happen.keydown(input.node(), {keyCode: 65});
            expect(spy.notCalled).to.be.ok;
        });

        it('dispatches when focus is in input elements when the capture flag was passed', function () {
            d3.select(document).call(keybinding.on('A', spy, true));

            happen.keydown(input.node(), {keyCode: 65});
            expect(spy.calledOnce).to.be.ok;
        });

        it('resets bindings when keybinding.unbind is called', function () {
            d3.select(document).call(keybinding.on('A', spy));
            happen.keydown(document, {keyCode: 65});
            expect(spy.calledOnce).to.be.ok;

            spy = sinon.spy();
            d3.select(document).call(keybinding.unbind);
            d3.select(document).call(keybinding.on('A', spy));
            happen.keydown(document, {keyCode: 65});
            expect(spy.calledOnce).to.be.ok;
        });

    });
});
