export function utilTriggerEvent(target, type, doc = document) {
    target.each(function() {
        var evt = doc.createEvent('HTMLEvents');
        evt.initEvent(type, true, true);
        if (typeof this.dispatchEvent === 'function') {
            this.dispatchEvent(evt);
        } else if (typeof this.emit === 'function') {
            this.emit(type, evt);
        }
    });
}