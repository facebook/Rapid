export const snowflakesConfig = {
    'lifetime': {
        'min': 8,
        'max': 8
    },
    'ease': [
        {
            's': 0,
            'cp': 0.379,
            'e': 0.548
        },
        {
            's': 0.548,
            'cp': 0.717,
            'e': 0.676
        },
        {
            's': 0.676,
            'cp': 0.635,
            'e': 1
        }
    ],
    'frequency': 0.004,
    'emitterLifetime': 0,
    'maxParticles': 3000,
    'addAtBack': true,
    'pos': {
        'x': 0,
        'y': 0
    },
    'behaviors': [
        {
            'type': 'alpha',
            'config': {
                'alpha': {
                    'list': [
                        {
                            'time': 0,
                            'value': 0.73
                        },
                        {
                            'time': 5,
                            'value': 0.46
                        }
                    ]
                }
            }
        },
        {
            'type': 'moveSpeedStatic',
            'config': {
                'min': 100,
                'max': 200
            }
        },
        {
            'type': 'scale',
            'config': {
                'scale': {
                    'list': [ 
                        {
                            'time': 0,
                            'value': 0.15
                        },
                        {
                            'time': 1,
                            'value': 0.2
                        }
                    ]
                },
                'minMult': 0.5
            }
        },
        {
            'type': 'rotation',
            'config': {
                'accel': 0,
                'minSpeed': 0,
                'maxSpeed': 200,
                'minStart': 50,
                'maxStart': 70
            }
        },
        {
            'type': 'textureRandom',
            'config': {
                'textures': [
                    'img/icons/snowflake.png'
                ]
            }
        },
        {
            'type': 'spawnShape',
            'config': {
                'type': 'rect',
                'data': {
                    'x': -100,
                    'y': -100,
                    'w': 1280,
                    'h': 1024
                }
            }
        }
    ]
};
