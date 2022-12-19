describe('iD.util', function() {

    describe('utilDisplayName', function() {
        it('returns the name if tagged with a name', function() {
            expect(iD.utilDisplayName({tags: {name: 'East Coast Greenway'}})).to.eql('East Coast Greenway');
        });
        it('returns just the name for non-routes', function() {
            expect(iD.utilDisplayName({tags: { name: 'Abyssinian Room', ref: '260-115' }})).to.eql('Abyssinian Room');
        });
        it('returns the name and the ref for routes', function() {
            expect(iD.utilDisplayName({tags: { name: 'Lynfield Express', ref: '25L', route: 'bus' }})).to.eql('25L: Lynfield Express');
            expect(iD.utilDisplayName({tags: { name: 'Kāpiti Expressway', ref: 'SH1', route: 'road' }})).to.eql('SH1: Kāpiti Expressway');
        });
        it('returns the name, ref, and network for routes', function() {
            expect(iD.utilDisplayName({tags: { name: 'Lynfield Express', ref: '25L', network: 'AT', route: 'bus' }})).to.eql('AT 25L: Lynfield Express');
        });
        it('does not use the network tag if the hideNetwork argument is true', function() {
            expect(iD.utilDisplayName({tags: { name: 'Lynfield Express', ref: '25L', network: 'AT', route: 'bus' }}, true)).to.eql('25L: Lynfield Express');
            expect(iD.utilDisplayName({tags: { network: 'SORTA', ref: '3X' }}, true)).to.eql('3X');
        });
        it('distinguishes unnamed features by ref', function() {
            expect(iD.utilDisplayName({tags: {ref: '66'}})).to.eql('66');
        });
        it('distinguishes unnamed features by network or cycle_network', function() {
            expect(iD.utilDisplayName({tags: {network: 'SORTA', ref: '3X'}})).to.eql('SORTA 3X');
            expect(iD.utilDisplayName({tags: {network: 'ncn', cycle_network: 'US:US', ref: '76'}})).to.eql('US:US 76');
        });
        it('distinguishes unnamed routes by direction', function() {
            expect(iD.utilDisplayName({tags: {network: 'US:US', ref: '66', direction: 'west', route: 'road'}})).to.eql('US:US 66 west');
            // Marguerite X: Counter-Clockwise
            expect(iD.utilDisplayName({tags: {network: 'Marguerite', ref: 'X', direction: 'anticlockwise', route: 'bus'}})).to.eql('Marguerite X anticlockwise');
        });
        it('distinguishes unnamed routes by waypoints', function() {
            expect(iD.utilDisplayName({tags: {network: 'SORTA', ref: '3X', from: 'Downtown', route: 'bus'}})).to.eql('SORTA 3X');
            expect(iD.utilDisplayName({tags: {network: 'SORTA', ref: '3X', to: 'Kings Island', route: 'bus'}})).to.eql('SORTA 3X');
            expect(iD.utilDisplayName({tags: {network: 'SORTA', ref: '3X', via: 'Montgomery', route: 'bus'}})).to.eql('SORTA 3X');
            // Green Line: Old Ironsides => Winchester
            expect(iD.utilDisplayName({tags: {network: 'VTA', ref: 'Green', from: 'Old Ironsides', to: 'Winchester', route: 'bus'}})).to.eql('VTA Green from Old Ironsides to Winchester');
            // BART Yellow Line: Antioch => Pittsburg/Bay Point => SFO Airport => Millbrae
            expect(iD.utilDisplayName({tags: {network: 'BART', ref: 'Yellow', from: 'Antioch', to: 'Millbrae', via: 'Pittsburg/Bay Point;San Francisco International Airport', route: 'subway'}})).to.eql('BART Yellow from Antioch to Millbrae via Pittsburg/Bay Point;San Francisco International Airport');
        });
//        it('uses the housename if there is no better name', function() {
//            expect(iD.utilDisplayName({tags: {'addr:housename': 'Pembridge House', 'addr:housenumber': '31', 'addr:street': 'Princes Street' }})).to.eql('Pembridge House');
//        });
//        it('uses the street address as a last resort', function() {
//            expect(iD.utilDisplayName({tags: {'addr:housenumber': '31', 'addr:street': 'Princes Street' }})).to.eql('31 Princes Street');
//        });
    });
});
