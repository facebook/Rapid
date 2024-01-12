describe('validationMissingTag', () => {

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
  }

  class MockContext {
    constructor() {
      this.services = {};
      this.systems = {
        l10n:  new MockLocalizationSystem()
      };
    }
  }

  const validator = Rapid.validationMissingTag(new MockContext());


  it('ignores way with descriptive tags', () => {
    const w = Rapid.osmWay({ tags: { leisure: 'park' }});
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores multipolygon with descriptive tags', () => {
    const r = Rapid.osmRelation({ tags: { type: 'multipolygon', leisure: 'park' }, members: [] });
    const g = new Rapid.Graph([r]);
    const issues = validator(r, g);
    expect(issues).to.have.lengthOf(0);
  });

  it('flags no tags', () => {
    const w = Rapid.osmWay({ tags: {} });
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('missing_tag');
    expect(issue.subtype).to.eql('any');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(w.id);
  });

  it('flags no descriptive tags on a way', () => {
    const w = Rapid.osmWay({ tags: { name: 'Main Street', source: 'Bing' } });
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('missing_tag');
    expect(issue.subtype).to.eql('descriptive');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(w.id);
  });

  it('flags no descriptive tags on multipolygon', () => {
    const r = Rapid.osmRelation({ tags: { name: 'City Park', source: 'Bing', type: 'multipolygon' }, members: [] });
    const g = new Rapid.Graph([r]);
    const issues = validator(r, g);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('missing_tag');
    expect(issue.subtype).to.eql('descriptive');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(r.id);
  });

  it('flags no type tag on relation', () => {
    const r = Rapid.osmRelation({ tags: { name: 'City Park', source: 'Bing', leisure: 'park' }, members: [] });
    const g = new Rapid.Graph([r]);
    const issues = validator(r, g);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('missing_tag');
    expect(issue.subtype).to.eql('relation_type');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(r.id);
  });

  it('ignores highway with classification', () => {
    const w = Rapid.osmWay({ tags: { highway: 'primary' }});
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(0);
  });

  it('flags highway=road', () => {
    const w = Rapid.osmWay({ tags: { highway: 'road' }});
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('missing_tag');
    expect(issue.subtype).to.eql('highway_classification');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(w.id);
  });

});
