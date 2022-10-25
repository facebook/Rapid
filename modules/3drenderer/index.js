import { Map } from './Map';
import { App }  from './App';

// mapboxgl.accessToken = 'pk.eyJ1IjoidG1jdyIsImEiOiJIZmRUQjRBIn0.lRARalfaGHnPdRcc-7QZYQ';

export class Buildings3D {

    constructor(context) {


        this.map = new Map();

        this.App = new App();
    }


    get buttonClass() { return 'hi'; }
}