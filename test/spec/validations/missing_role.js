describe('validationMissingRole', () => {

  class MockLocalizationSystem {
    constructor() {}
    displayLabel(entity)  { return entity.id; }
    t(id)                 { return id; }
  }

  class MockContext {
    constructor() {
      this.systems = {
        l10n:  new MockLocalizationSystem()
      };
    }
  }

  const validator = Rapid.validationMissingRole(new MockContext());


  it('ignores ways with no relations', () => {
    const w = Rapid.osmWay();
    const g = new Rapid.Graph([w]);
    const issues = validator(w, g);
    expect(issues).to.have.lengthOf(0);
  });

  it('ignores member with missing role in non-multipolygon relation', () => {
    const w = Rapid.osmWay();
    const r = Rapid.osmRelation({ tags: { type: 'boundary' }, members: [{ id: w.id, role: '' }] });
    const g = new Rapid.Graph([w, r]);
    const rIssues = validator(r, g);
    const wIssues = validator(w, g);
    expect(rIssues).to.have.lengthOf(0);
    expect(wIssues).to.have.lengthOf(0);
  });

  it('ignores way with outer role in multipolygon', () => {
    const w = Rapid.osmWay();
    const r = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: w.id, role: 'outer' }] });
    const g = new Rapid.Graph([w, r]);
    const rIssues = validator(r, g);
    const wIssues = validator(w, g);
    expect(rIssues).to.have.lengthOf(0);
    expect(wIssues).to.have.lengthOf(0);
  });

  it('ignores way with inner role in multipolygon', () => {
    const w = Rapid.osmWay();
    const r = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: w.id, role: 'inner' }] });
    const g = new Rapid.Graph([w, r]);
    const rIssues = validator(r, g);
    const wIssues = validator(w, g);
    expect(rIssues).to.have.lengthOf(0);
    expect(wIssues).to.have.lengthOf(0);
  });

  it('flags way with missing role in multipolygon', () => {
    const w = Rapid.osmWay();
    const r = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: w.id, role: '' }] });
    const g = new Rapid.Graph([w, r]);
    const rIssues = validator(r, g);
    const wIssues = validator(w, g);
    expect(rIssues).to.have.lengthOf(1);
    expect(wIssues).to.have.lengthOf(1);
    expect(rIssues[0].hash).to.eql(wIssues[0].hash);

    const issue = rIssues[0];
    expect(issue.type).to.eql('missing_role');
    expect(issue.entityIds).to.have.lengthOf(2);
    expect(issue.entityIds[0]).to.eql(r.id);
    expect(issue.entityIds[1]).to.eql(w.id);
  });

  it('flags way with whitespace string role in multipolygon', () => {
    const w = Rapid.osmWay();
    const r = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: w.id, role: '  ' }] });
    const g = new Rapid.Graph([w, r]);
    const rIssues = validator(r, g);
    const wIssues = validator(w, g);
    expect(rIssues).to.have.lengthOf(1);
    expect(wIssues).to.have.lengthOf(1);
    expect(rIssues[0].hash).to.eql(wIssues[0].hash);

    const issue = rIssues[0];
    expect(issue.type).to.eql('missing_role');
    expect(issue.entityIds).to.have.lengthOf(2);
    expect(issue.entityIds[0]).to.eql(r.id);
    expect(issue.entityIds[1]).to.eql(w.id);
  });

});
