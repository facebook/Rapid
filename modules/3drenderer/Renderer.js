/* eslint-disable */
import { Map } from './Map';

export class Renderer {

    constructor(context) {
        this.state = { active: false,
            features: []
        };
        this.context = context;
        this.bounds = null;
        this.toggle = this.toggle.bind(this);
    }

    featuresToGeoJSON() {
        var context = this.props.context;
        var map = context.map();
        const entities = context.history().intersects(map.extent());
        const buildingEnts = entities.filter(ent => {
            const tags = Object.keys(ent.tags).filter(tagname => tagname.startsWith('building'));
            return tags.length > 0;
        });
        var features = [];
        for (var id in buildingEnts) {
//            try {
                var gj = buildingEnts[id].asGeoJSON(context.graph());
                if (gj.type !== 'Polygon') continue;
                features.push({
                    type: 'Feature',
                    properties: {
                        extrude: true,
                        min_height: buildingEnts[id].tags.min_height ? parseFloat(buildingEnts[id].tags.min_height) : 0,
                        height: parseFloat(buildingEnts[id].tags.height || buildingEnts[id].tags['building:levels'] * 3 || 0)
                    },
                    geometry: gj
                });
//            } catch (e) {
//                console.error(e);
//            }
        }
        this.setState({
        geojson: {
                type: 'FeatureCollection',
                features: features
        }
        });
    }


        setup() {
            const context = this.context;
            this.bounds = [
                context.map().extent().min,
                context.map().extent().max
            ];
            context.on('enter.idupwards', (e) => {
                this.featuresToGeoJSON();
            });
            context.history().on('change.idupwards', (e) => {
                this.featuresToGeoJSON();
            });
            context.map().on('move', () => {
                this.bounds = [
                        context.map().extent().min,
                        context.map().extent().max
                    ]
            });
        }


        toggle () {
                this.active = !this.active
        }

        render () {

            return <div className='map-control'>
                {state.active ?
                    <div style={{ zIndex: -1,
                        position: 'absolute',
                        width: '300px',
                        height: '300px',
                        right: 0,
                        bottom: 0
                    }} className='content'>
                        <Map bounds={this.bounds} geojson={this.geojson} />
                    </div> : null}
                <button tabIndex='-1' style={{color:'white'}} onClick={this.toggle}>
                    3D
                </button>
                </div>;
        }
}
