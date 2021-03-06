// Load modules

var Joi = require('joi');
var Hoek = require('hoek');


// Declare internals

var internals = {};


exports.assert = function (type, options, message) {

    var result = Joi.validate(options, internals[type]);
    Hoek.assert(!result.error, 'Invalid', type, 'options', message ? '(' + message + ')' : '', result.error && result.error.annotate());
    return result.value;
};


internals.cache = Joi.object({
    name: Joi.string().invalid('_default'),
    partition: Joi.string(),
    shared: Joi.boolean(),
    engine: Joi.alternatives([
        Joi.object(),
        Joi.func()
    ])
        .required()
}).unknown();


internals.security = Joi.object({
    hsts: [
        Joi.object({
            maxAge: Joi.number(),
            includeSubdomains: Joi.boolean()
        }),
        Joi.boolean(),
        Joi.number()
    ],
    xframe: [
        Joi.boolean(),
        Joi.string().valid('sameorigin', 'deny'),
        Joi.object({
            rule: Joi.string().valid('sameorigin', 'deny', 'allow-from'),
            source: Joi.string()
        })
    ],
    xss: Joi.boolean(),
    noOpen: Joi.boolean(),
    noSniff: Joi.boolean()
}).allow(null, false, true);


internals.labels = Joi.alternatives([
    Joi.string(),
    Joi.array().includes(Joi.string())
]);


internals.absPath = Joi.string().regex(/^([\/\.])|([A-Za-z]:\\)|(\\\\)/);


internals.connectionBase = Joi.object({
    app: Joi.object().allow(null),
    cors: Joi.object({
        origin: Joi.array(),
        matchOrigin: Joi.boolean(),
        isOriginExposed: Joi.boolean(),
        maxAge: Joi.number(),
        headers: Joi.array(),
        additionalHeaders: Joi.array(),
        methods: Joi.array(),
        additionalMethods: Joi.array(),
        exposedHeaders: Joi.array(),
        additionalExposedHeaders: Joi.array(),
        credentials: Joi.boolean(),
        override: Joi.boolean()
    })
        .allow(null, false, true),
    security: internals.security,
    files: Joi.object({
        relativeTo: internals.absPath.required()
    }),
    json: Joi.object({
        replacer: Joi.alternatives(Joi.func(), Joi.array()).allow(null),
        space: Joi.number().allow(null),
        suffix: Joi.string().allow(null)
    }),
    load: Joi.object(),
    cacheControlStatus: Joi.array().min(1).includes(Joi.number().integer().min(200)),
    payload: Joi.object({
        maxBytes: Joi.number(),
        uploads: Joi.string()
    }),
    plugins: Joi.object(),
    router: Joi.object({
        isCaseSensitive: Joi.boolean(),
        stripTrailingSlash: Joi.boolean()
    }),
    validation: Joi.object().allow(null),
    state: Joi.object({
        cookies: Joi.object({
            parse: Joi.boolean(),
            failAction: Joi.string().valid('error', 'log', 'ignore'),
            clearInvalid: Joi.boolean(),
            strictHeader: Joi.boolean()
        })
    }),
    timeout: Joi.object({
        socket: Joi.number().integer().positive().allow(false),
        client: Joi.number().integer().positive().allow(false).required(),
        server: Joi.number().integer().positive().allow(false).required()
    })
});


internals.server = Joi.object({
    app: Joi.object().allow(null),
    cache: Joi.alternatives([
        Joi.func(),
        internals.cache,
        Joi.array().includes(internals.cache).min(1)
    ]).allow(null),
    connections: internals.connectionBase,
    debug: Joi.object({
        request: Joi.array().allow(false)
    }).allow(false),
    files: Joi.object({
        etagsCacheMaxSize: Joi.number().min(0)
    }),
    load: Joi.object(),
    mime: Joi.object(),
    plugins: Joi.object()
});


internals.connection = internals.connectionBase.keys({
    autoListen: Joi.boolean(),
    host: Joi.string().hostname().allow(null),
    labels: internals.labels,
    listener: Joi.any(),
    port: Joi.alternatives([
        Joi.number().integer().min(0),          // TCP port
        Joi.string().regex(/\//),               // Unix domain socket
        Joi.string().regex(/^\\\\\.\\pipe\\/)   // Windows named pipe
    ])
        .allow(null),
    tls: Joi.object().allow(null)
});


internals.vhost = Joi.alternatives([
    Joi.string().hostname(),
    Joi.array().includes(Joi.string().hostname()).min(1)
]);


internals.route = Joi.object({
    method: Joi.alternatives(Joi.string(), Joi.array().includes(Joi.string()).min(1)).required(),
    path: Joi.string().required(),
    vhost: internals.vhost,
    handler: Joi.any(),                         // Validated in route.config
    config: Joi.object().allow(null)
});


internals.pre = [
    Joi.string(),
    Joi.func(),
    Joi.object({
        method: Joi.alternatives(Joi.string(), Joi.func()).required(),
        assign: Joi.string(),
        mode: Joi.string().valid('serial', 'parallel'),
        failAction: Joi.string().valid('error', 'log', 'ignore')
    })
];


internals.auth = Joi.alternatives([
    Joi.string(),
    Joi.object({
        mode: Joi.string().valid('required', 'optional', 'try'),
        scope: [
            Joi.string(),
            Joi.array()
        ],
        entity: Joi.string().valid('user', 'app', 'any'),
        strategy: Joi.string(),
        strategies: Joi.array().min(1),
        payload: [
            Joi.string().valid('required', 'optional'),
            Joi.boolean()
        ]
    })
        .without('strategy', 'strategies')
]);


internals.routeConfig = Joi.object({
    id: Joi.string(),
    pre: Joi.array().includes(internals.pre.concat(Joi.array().includes(internals.pre).min(1))),
    handler: [
        Joi.func(),
        Joi.string(),
        Joi.object().length(1)
    ],
    bind: Joi.object().allow(null),
    payload: Joi.object({
        output: Joi.string().valid('data', 'stream', 'file'),
        parse: Joi.boolean().allow('gunzip'),
        allow: [
            Joi.string(),
            Joi.array()
        ],
        override: Joi.string(),
        maxBytes: Joi.number(),
        uploads: Joi.string(),
        failAction: Joi.string().valid('error', 'log', 'ignore'),
        timeout: Joi.number().integer().positive().allow(false)
    }),
    auth: internals.auth.allow(false),
    validate: Joi.object({
        headers: Joi.alternatives(Joi.object(), Joi.func()).allow(null, false, true),
        params: Joi.alternatives(Joi.object(), Joi.func()).allow(null, false, true),
        query: Joi.alternatives(Joi.object(), Joi.func()).allow(null, false, true),
        payload: Joi.alternatives(Joi.object(), Joi.func()).allow(null, false, true),
        failAction: [
            Joi.string().valid('error', 'log', 'ignore'),
            Joi.func()
        ],
        errorFields: Joi.object()
    })
        .or('headers', 'params', 'query', 'payload'),
    response: Joi.object({
        schema: Joi.alternatives(Joi.object(), Joi.func()).allow(true, false),
        status: Joi.object().pattern(/\d\d\d/, Joi.alternatives(Joi.object(), Joi.func()).allow(true, false)),
        sample: Joi.number().min(0).max(100),
        failAction: Joi.string().valid('error', 'log'),
        modify: Joi.boolean()
    })
        .or('schema', 'status')
        .without('modify', 'sample'),
    cache: Joi.object({
        privacy: Joi.string().valid('default', 'public', 'private'),
        expiresIn: Joi.number(),
        expiresAt: Joi.string()
    })
        .xor('expiresIn', 'expiresAt'),
    cors: Joi.boolean(),
    security: internals.security,
    jsonp: Joi.string(),
    app: Joi.object().allow(null),
    plugins: Joi.object(),
    description: Joi.string(),
    notes: [
        Joi.string(),
        Joi.array().includes(Joi.string())
    ],
    tags: [
        Joi.string(),
        Joi.array().includes(Joi.string())
    ],
    files: Joi.object({
        relativeTo: internals.absPath
    })
});


internals.cachePolicy = Joi.object({
    cache: Joi.string().allow(null).allow(''),
    segment: Joi.string(),
    shared: Joi.boolean()
})
    .options({ allowUnknown: true });               // Catbox validates other keys


internals.method = Joi.object({
    bind: Joi.object().allow(null),
    generateKey: Joi.func(),
    cache: internals.cachePolicy,
    callback: Joi.boolean()
});


internals.register = Joi.object({
    route: Joi.object({
        prefix: Joi.string().regex(/^\/.+/),
        vhost: internals.vhost
    }),
    select: internals.labels
});


internals.state = Joi.object({
    strictHeader: Joi.boolean(),
    failAction: Joi.string().valid('error', 'log', 'ignore'),
    clearInvalid: Joi.boolean(),
    isSecure: Joi.boolean(),
    isHttpOnly: Joi.boolean(),
    path: Joi.string(),
    domain: Joi.string(),
    ttl: Joi.number().allow(null),
    encoding: Joi.string().valid('base64json', 'base64', 'form', 'iron', 'none'),
    sign: Joi.object({
        password: [Joi.string(), Joi.binary(), Joi.object()],
        integrity: Joi.object()
    }),
    iron: Joi.object(),
    password: [Joi.string(), Joi.binary(), Joi.object()],
    autoValue: Joi.any(),
    passThrough: Joi.boolean()
});
