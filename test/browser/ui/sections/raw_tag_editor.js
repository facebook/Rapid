describe('uiSectionRawTagEditor', () => {
  let rawTagEditor, wrap;

  class MockLocalizationSystem {
    constructor() { }
    isRTL()       { return false; }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockStorageSystem {
    constructor() { }
    getItem()     { return null; }
  }

  class MockContext {
    constructor()   {
      this.services = {};
      this.systems = {
        assets:   new Rapid.AssetSystem(this),
        l10n:     new MockLocalizationSystem(),
        storage:  new MockStorageSystem()
      };
    }
    cleanTagKey(val)    { return val; }
    cleanTagValue(val)  { return val; }
  }

  const context = new MockContext();
  const entity = Rapid.osmNode({ id: 'n-1' });


  beforeEach(() => {
    render({ highway: 'residential' });
  });

  afterEach(() => {
    d3.selectAll('.ui-wrap').remove();
  });


  function render(tags) {
    rawTagEditor = Rapid.uiSectionRawTagEditor(context, 'raw-tag-editor')
      .entityIDs([ entity.id ])
      .presets([ { isFallback: () => false } ])
      .tags(tags);

    wrap = d3.select('body')
      .append('div')
      .attr('class', 'ui-wrap')
      .call(rawTagEditor.render);
  }


  it('creates input elements for each key-value pair', () => {
    expect(wrap.selectAll('input[value=highway]')).not.to.be.empty;
    expect(wrap.selectAll('input[value=residential]')).not.to.be.empty;
  });


  it('creates a pair of empty input elements if the entity has no tags', () => {
    wrap.remove();
    render({});
    expect(wrap.select('.tag-list').selectAll('input.value').property('value')).to.be.empty;
    expect(wrap.select('.tag-list').selectAll('input.key').property('value')).to.be.empty;
  });


  it('adds tags when clicking the add button', done => {
    happen.click(wrap.selectAll('button.add-tag').node());
    window.setTimeout(() => {
      expect(wrap.select('.tag-list').selectAll('input').nodes()[2].value).to.be.empty;
      expect(wrap.select('.tag-list').selectAll('input').nodes()[3].value).to.be.empty;
      done();
    }, 20);
  });


  it('removes tags when clicking the remove button', done => {
    rawTagEditor.on('change', (entityIDs, tags) => {
      expect(tags).to.eql({ highway: undefined });
      done();
    });
    Rapid.utilTriggerEvent(wrap.selectAll('button.remove'), 'mousedown');
  });


  it('adds tags when pressing the TAB key on last input.value', done => {
    expect(wrap.selectAll('.tag-list li').nodes().length).to.eql(1);
    const input = d3.select('.tag-list li:last-child input.value').nodes()[0];

    happen.keydown(d3.select(input).node(), { keyCode: 9 });
    window.setTimeout(() => {
      expect(wrap.selectAll('.tag-list li').nodes().length).to.eql(2);
      expect(wrap.select('.tag-list').selectAll('input').nodes()[2].value).to.be.empty;
      expect(wrap.select('.tag-list').selectAll('input').nodes()[3].value).to.be.empty;
      done();
    }, 20);
  });


  it('does not add a tag when pressing TAB while shift is pressed', done => {
    expect(wrap.selectAll('.tag-list li').nodes().length).to.eql(1);
    const input = d3.select('.tag-list li:last-child input.value').nodes()[0];
    happen.keydown(d3.select(input).node(), { keyCode: 9, shiftKey: true });
    window.setTimeout(() => {
      expect(wrap.selectAll('.tag-list li').nodes().length).to.eql(1);
      done();
    }, 20);
  });
});
