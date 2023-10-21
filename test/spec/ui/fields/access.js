describe('uiFieldAccess', () => {
  let selection, field;

  class MockLocalizationSystem {
    constructor() { }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockContext {
    constructor() {
      this.systems = {
        l10n: new MockLocalizationSystem(this)
      };
    }
    container()  { return selection; }
  }


  const context = new MockContext();

  beforeEach(() => {
    selection = d3.select(document.createElement('div'));
    field = new Rapid.Field(context, 'access', {
      keys: ['access', 'foot', 'motor_vehicle', 'bicycle', 'horse'],
      type: 'access'
    });
  });


  it('creates inputs for a constiety of modes of access', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);
    expect(selection.selectAll('.preset-access-access').size()).to.equal(1);
    expect(selection.selectAll('.preset-access-foot').size()).to.equal(1);
    expect(selection.selectAll('.preset-access-motor_vehicle').size()).to.equal(1);
    expect(selection.selectAll('.preset-access-bicycle').size()).to.equal(1);
    expect(selection.selectAll('.preset-access-horse').size()).to.equal(1);
  });


  it('does not include "yes", "designated", "dismount" options for general access (iD#934), (iD#2213)', () => {
    const access = Rapid.uiFieldAccess(context, field);
    const options = access.options('access').map(v => v.value);
    expect(options).not.to.include('yes');
    expect(options).not.to.include('designated');
    expect(options).not.to.include('dismount');
  });


  it('does include a "dismount" option for bicycles (iD#2726)', () => {
    const access = Rapid.uiFieldAccess(context, field);
    let options;

    options = access.options('bicycle').map(v => v.value);
    expect(options).to.include('dismount');

    options = access.options('foot').map(v => v.value);
    expect(options).not.to.include('dismount');
  });


  it('sets foot placeholder to "yes" for steps and pedestrian', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);

    access.tags({ highway: 'steps' });
    expect(selection.selectAll('.preset-input-access-foot').attr('placeholder')).to.equal('yes');

    access.tags({ highway: 'pedestrian' });
    expect(selection.selectAll('.preset-input-access-foot').attr('placeholder')).to.equal('yes');
  });


  it('sets foot placeholder to "designated" for footways', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);

    access.tags({ highway: 'footway' });
    expect(selection.selectAll('.preset-input-access-foot').attr('placeholder')).to.equal('designated');
  });


  it('sets bicycle placeholder to "designated" for cycleways', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);

    access.tags({ highway: 'cycleway' });
    expect(selection.selectAll('.preset-input-access-bicycle').attr('placeholder')).to.equal('designated');
  });


  it('sets horse placeholder to "designated" for bridleways', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);

    access.tags({ highway: 'bridleway' });
    expect(selection.selectAll('.preset-input-access-horse').attr('placeholder')).to.equal('designated');
  });


  it('sets motor_vehicle placeholder to "no" for footways, steps, pedestrian, cycleway, bridleway, and path', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);
    ['footway', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'path'].forEach(value => {
      access.tags({ highway: value });
      expect(selection.selectAll('.preset-input-access-motor_vehicle').attr('placeholder')).to.equal('no');
    });
  });


  it('sets motor_vehicle placeholder to "yes" for various other highway tags', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);
    [
      'residential', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'service',
      'unclassified', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
    ].forEach(value => {
      access.tags({ highway: value });
      expect(selection.selectAll('.preset-input-access-motor_vehicle').attr('placeholder')).to.equal('yes');
    });
  });


  it('overrides a "yes" or "designated" placeholder with more specific access tag (iD#2213)', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);

    access.tags({ highway: 'service', access: 'emergency' });
    expect(selection.selectAll('.preset-input-access-motor_vehicle').attr('placeholder')).to.equal('emergency');

    access.tags({ highway: 'cycleway', access: 'permissive' });
    expect(selection.selectAll('.preset-input-access-bicycle').attr('placeholder')).to.equal('permissive');
  });


  it('overrides a "no" placeholder with more specific access tag (iD#2763)', () => {
    const access = Rapid.uiFieldAccess(context, field);
    selection.call(access);

    access.tags({ highway: 'cycleway', access: 'destination' });
    expect(selection.selectAll('.preset-input-access-motor_vehicle').attr('placeholder')).to.equal('destination');
  });

});
