describe('uiConfirm', () => {
  let elem;

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockContext {
    constructor()   {
      this.systems = {
        l10n:  new MockLocalizationSystem()
      };
    }
  }

  const context = new MockContext();


  beforeEach(() => {
    elem = d3.select('body')
      .append('div')
      .attr('class', 'confirm-wrap');
  });

  afterEach(() => {
    d3.select('.confirm-wrap')
      .remove();
  });

  it('can be instantiated', () => {
    const selection = Rapid.uiConfirm(context, elem);
    expect(selection).to.be.ok;
  });

  it('has a header section', () => {
    const selection = Rapid.uiConfirm(context, elem);
    expect(selection.selectAll('div.content div.header').size()).to.equal(1);
  });

  it('has a message section', () => {
    const selection = Rapid.uiConfirm(context, elem);
    expect(selection.selectAll('div.content div.message-text').size()).to.equal(1);
  });

  it('has a buttons section', () => {
    const selection = Rapid.uiConfirm(context, elem);
    expect(selection.selectAll('div.content div.buttons').size()).to.equal(1);
  });

  it('can have an ok button added to it', () => {
    const selection = Rapid.uiConfirm(context, elem).okButton();
    expect(selection.selectAll('div.content div.buttons button.action').size()).to.equal(1);
  });

  it('can be dismissed by calling close function', done => {
    const selection = Rapid.uiConfirm(context, elem);
    selection.close();
    window.setTimeout(() => {
      d3.timerFlush();
      expect(selection.node().parentNode).to.be.null;
      done();
    }, 275);
  });

  it('can be dismissed by clicking the close button', done => {
    const selection = Rapid.uiConfirm(context, elem);
    happen.click(selection.select('button.close').node());
    window.setTimeout(() => {
      d3.timerFlush();
      expect(selection.node().parentNode).to.be.null;
      done();
    }, 275);
  });

  it('can be dismissed by pressing escape', done => {
    const selection = Rapid.uiConfirm(context, elem);
    happen.keydown(document, {keyCode: 27});
    happen.keyup(document, {keyCode: 27});
    window.setTimeout(() => {
      d3.timerFlush();
      expect(selection.node().parentNode).to.be.null;
      done();
    }, 275);
  });

  it('can be dismissed by pressing backspace', done => {
    const selection = Rapid.uiConfirm(context, elem);
    happen.keydown(document, {keyCode: 8});
    happen.keyup(document, {keyCode: 8});
    window.setTimeout(() => {
      d3.timerFlush();
      expect(selection.node().parentNode).to.be.null;
      done();
    }, 275);
  });

  it('can be dismissed by clicking the ok button', done => {
    const selection = Rapid.uiConfirm(context, elem).okButton();
    happen.click(selection.select('div.content div.buttons button.action').node());
    window.setTimeout(() => {
      d3.timerFlush();
      expect(selection.node().parentNode).to.be.null;
      done();
    }, 275);
  });
});
