describe('validationOutdatedTags', () => {

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
  }

  class MockLocationSystem {
    constructor() {}
  }

  class MockContext {
    constructor() {
      this.services = {};
      this.systems = {
        assets:     new Rapid.AssetSystem(this),
        l10n:       new MockLocalizationSystem(),
        locations:  new MockLocationSystem(),
        presets:    new Rapid.PresetSystem(this)
      };
    }
  }

  const validator = Rapid.validationOutdatedTags(new MockContext());


  it('has no errors on good tags', () => {
    const w = Rapid.osmWay({ tags: { highway: 'unclassified' }});
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(0);
  });

  it('flags deprecated tag with replacement', () => {
    const w = Rapid.osmWay({ tags: { highway: 'ford' }});
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('outdated_tags');
    expect(issue.subtype).to.eql('deprecated_tags');
    expect(issue.severity).to.eql('warning');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(w.id);
  });

  it('flags deprecated tag with no replacement', () => {
    const w = Rapid.osmWay({ tags: { highway: 'no' }});
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(1);
    const issue = issues[0];
    expect(issue.type).to.eql('outdated_tags');
    expect(issue.subtype).to.eql('deprecated_tags');
    expect(issue.severity).to.eql('warning');
    expect(issue.entityIds).to.have.lengthOf(1);
    expect(issue.entityIds[0]).to.eql(w.id);
  });

  it('ignores multipolygon tagged on the relation', () => {
    const w = Rapid.osmWay({ tags: {} });
    const r = Rapid.osmRelation({ tags: { building: 'yes', type: 'multipolygon' }, members: [{ id: w.id, role: 'outer' }] });
    const g = new Rapid.Graph([w, r]);
    const wIssues = validator(w, g);
    const rIssues = validator(r, g);
    expect(wIssues).to.have.lengthOf(0);
    expect(rIssues).to.have.lengthOf(0);
  });

  it('flags multipolygon tagged on the outer way', () => {
    const w = Rapid.osmWay({ tags: { building: 'yes' } });
    const r = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: w.id, role: 'outer' }] });
    const g = new Rapid.Graph([w, r]);
    const wIssues = validator(w, g);
    const rIssues = validator(r, g);
    expect(rIssues).to.have.lengthOf(0);
    expect(wIssues).to.have.lengthOf(1);

    const issue = wIssues[0];
    expect(issue.type).to.eql('outdated_tags');
    expect(issue.subtype).to.eql('old_multipolygon');
    expect(issue.entityIds).to.have.lengthOf(2);
    expect(issue.entityIds[0]).to.eql(w.id);
    expect(issue.entityIds[1]).to.eql(r.id);
  });

});
