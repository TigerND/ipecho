/* -*- coding: utf-8 -*-
============================================================================= */
/*jshint asi: true*/

var debug = require('debug')('ipecho:main')

var _ = require("underscore"),
    os = require("os"),
    fs = require("fs-extra"),
    path = require('path'),
    util = require("util"),
    async = require("async"),
    express = require('express'),
    http = require('http'),
    https = require('https'),
    Handlebars = require('handlebars'),
    yaml = require('js-yaml'),
    whois = require('whois')
    
/* Environment
============================================================================= */

var pkg = fs.readJsonSync(path.join(__dirname, 'package.json'))

var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE

if (process.env.DEBUG) {
    process.env.NODE_ENV='debug'
    process.env.NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR || path.join(__dirname, 'config')
}
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV='production'
    process.env.NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR || path.join(home, '.' + pkg.name, 'config')
}

/* Command line arguments
============================================================================= */

var argv = require("nomnom")
   .option('config', {
      abbr: 'c',
      default: process.env.NODE_CONFIG_DIR,
      help: 'Path to config files'
   })
   .option('version', {
      flag: true,
      help: 'Prints version and exits',
      callback: function() {
         return 'version ' + pkg.version;
      }
   })
   .parse()

/* Config
============================================================================= */

debug('Config path: ' + argv.config)
if (!fs.existsSync(argv.config)) {
    console.log('Copying default config files to ' + argv.config)
    fs.ensureDirSync(argv.config)
    fs.copySync(path.join(__dirname, 'config'), argv.config)
    fs.writeFileSync(path.join(argv.config, 'version'), pkg.version)
}

process.env.NODE_CONFIG_DIR = argv.config
var config = {
    app: require('config').get(pkg.name)
}

/* Templates
============================================================================= */

var template = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, '/templates/ipecho.html')).toString()
)

var error = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, '/templates/error.html')).toString()
)

/* Express
============================================================================= */

var morgan = require('morgan')

var log = null
if (config.app.debug) {
    log = morgan('dev')
} else {
    log = morgan('combined')
}

var favicon = require('serve-favicon')

var app = express()
app.use(log)

app.use(favicon(path.join(__dirname, '/static/favicon.ico')))

app.use(function(req, res, next) {
    debug(req.originalUrl)
    next()
})

if (config.app.cors) {
    app.use(function(req, res, next) {
        res.header('Access-Control-Allow-Origin', config.app.cors);
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    })
}

/* Globals
============================================================================= */

var acceptedTypes = []
var supportedTypes = []

/* Handlers
============================================================================= */

var handlersList = []
var handlersByMimeType = {}

var Handler = function(contentType, mimeType, handler) {
    this.contentType = contentType
    this.mimeType = mimeType
    this.hndl = handler
}

var registerHandler = function(contentType, mimeType, handler) {
    if (Array.isArray(contentType)) {
        contentType.forEach(function(contentType) {
            registerHandler(contentType, mimeType, handler)
        })
    } else {
        var hh = new Handler(contentType, mimeType, handler)
        handlersList.push(hh)
        if (!handlersByMimeType.hasOwnProperty(mimeType)) {
            handlersByMimeType[mimeType] = hh
        }
    }
}

registerHandler("text/plain", "text", function(req, res, address, type, callback) {
    callback = callback || function() {}
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(address.ip.toString())
    callback()
})

registerHandler("application/json", "json", function(req, res, address, type, callback) {
    callback = callback || function() {}
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(JSON.stringify(address))
    callback()
})

registerHandler("application/javascript", "js", function(req, res, address, type, callback) {
    callback = callback || function() {}
    if (req.query.callback) {
        res.writeHead(200, {
            'Content-Type': type
        });
        res.end(req.query.callback + '(' + JSON.stringify(address) + ')')
        callback()
    } else {
        callback('Callback is not specified.')
    }
})

registerHandler([
    "text/yaml",
    "text/x-yaml",
    "application/yaml",
    "application/x-yaml"
], "yaml", function(req, res, address, type, callback) {
    callback = callback || function() {}
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(yaml.safeDump(address))
    callback()
})

registerHandler("text/html", 'html', function(req, res, address, type, callback) {
    callback = callback || function() {}
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(template({
        address: address,
        supportedTypes: supportedTypes,
        config: config.app
    }))
    callback()
})

/* Http API
============================================================================= */

handlersList.forEach(function(v) {
    // for req.accepts()
    acceptedTypes.push(v.contentType)
    // for Handlebars
    supportedTypes.push({type: v.contentType})
})


var responseError = function(req, res, code, message) {
    res.writeHead(400, {'Content-Type': 'text/html'});
    res.end(error({
        description: message,
        supportedTypes: supportedTypes,
        config: config.app
    }))
}

var processQuery = function(req, res, handler, callback) {
    callback = callback || function(err) {
        if (err) { responseError(req, res, 400, err) }
    }
    handler(req, res, function(err, data) {
        if (err) {
            callback(err)
        } else {
            console.log(data)
            var format = req.query.format
            if (format) {
                debug('Requested format: ' + format)
                if (handlersByMimeType.hasOwnProperty(format)) {
                    var hh = handlersByMimeType[format]
                    hh.hndl(req, res, data, hh.contentType, function(err) {
                        callback(err)
                    })
                } else {
                    callback('Invalid format specified.')
                }
            } else {
                var accepts = req.accepts(acceptedTypes)
                var not_found = handlersList.every(function(v) {
                    if (accepts == v.contentType) {
                        v.hndl(req, res, data, v.contentType)
                        return false
                    }
                    return true
                })
                if (not_found) {
                    callback('Invalid content type.')
                }
            }
        }
    })
}

/* GeoIP
 *   http://dev.maxmind.com/geoip/legacy/geolite/
============================================================================= */

try {
    var geoip = require('geoip')
    
    var geoipDataFiles = [{
        type: geoip.City,
        name: 'GeoLiteCity.dat'
    }, {
        type: geoip.City6,
        name: 'GeoLiteCityv6.dat'
    }, {
        type: geoip.Country,
        name: 'GeoIP.dat'
    }, {
        type: geoip.Country6,
        name: 'GeoIPv6.dat'
    }]
    
    var geoipData = []
    
    var geoipDataPath = path.join(home, '.' + pkg.name, 'geoip')
    
    geoipDataFiles.forEach(function(item) {
        var fileName = path.join(geoipDataPath, item.name)
        try {
            var data = new item.type(fileName)
            geoipData.push({
                name: item.name,
                data: data
            })
            debug('Loaded ' + fileName)
        } catch(err) {
            console.log('Failed to load ' + fileName)
            console.log(err)
        }
    })
    
    if (geoipData.length === 0) {
        console.log('GeoIP data files not found. Download it from: http://dev.maxmind.com/geoip/legacy/geolite/ and copy to', geoipDataPath)
    }
    
    var geoipLookup = function(addr, callback) {
        async.detect(geoipData, function(country, cb) {
            debug('Processing ' + country.name)
            country.data.lookup(addr, function(err, data) {
                //callback((typeof err !== undefined) && (typeof err !== null))
                if (!err && data) {
                    country.lastResolved = data
                    cb(true)
                } else {
                    if (err) { debug('Error: ' + err) }
                    cb(false)
                }
            })
        }, function(result) {
            if (result) {
                debug('Resolved:')
                debug(result)
                callback(null, result.lastResolved)
            } else {
                callback('Not found')
            }
        })
    }
} catch(exc) {
    console.log('Warning: Using geoip-lite...')
    
    var geoip = require('geoip-lite')
    
    var geoipLookup = function(addr, callback) {
        try {
            var geo = geoip.lookup(addr)
            console.log(geo)
            callback(null, geo)
        } catch(exc) {
            callback(exc)
        }
    }
}

/* IP Echo itself :)
============================================================================= */

var extractAddress = function(req, res, callback) {
    var real_ip = req.headers['x-real-ip']
    debug('x-real-ip: ' + real_ip)
    var x_forwarded_server = req.headers['x-forwarded-server']
    debug('x-forwarded-server: ' + x_forwarded_server)
    if (x_forwarded_server == 'bit.pe') {
        var ips = req.headers['x-forwarded-for']
        if (ips) {
            ips = ips.split(',')
            real_ip = ips[ips.length - 1]
        }
    }
    var address = real_ip ||
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress ||
                  req.connection.socket.remoteAddress
    console.log(os.EOL, address, '-', req.headers['host'])
    geoipLookup(address, function(err, data) {
        if (err) {
            debug('Error: ' + err)
            callback(null, {
                ip: address
            })
        } else {
            callback(null, {
                ip: address,
                geoip: data.country_code3 || data.country_code || data.country
            })
        }
    })
    /*
    whois.lookup(address, function(err, data) {
        if (err) {
            debug('Error: ' + err)
        } else {
            debug('WHOIS:')
            debug(data)
        }
    })
    */
}

app.get('/', function(req, res) {
    processQuery(req, res, extractAddress)
})

/*
app.param('mimeType', function(req, res, next, id) {
    debug('MIME Type: ' + id)
    req.mimeType = id
    next()
})

app.get('/:mimeType', function(req, res) {
    var address = extractAddress(req)
    if (handlersByMimeType.hasOwnProperty(req.params.mimeType)) {
        var hh = handlersByMimeType[req.params.mimeType]
        hh.hndl(req, res, address, hh.contentType)
    } else {
        responseError(req, res, 400, 'Invalid mime type.')
    }
})
*/

/* Admin interface
============================================================================= */

app.use('/static', express.static(path.join(__dirname, 'static')))
app.use(express.static(path.join(__dirname, 'public')))

/* Listeners
============================================================================= */

var listeners = {}

listeners.http = function(listener, callback) {
    console.log('Starting HTTP server on ' + listener.port)
    try {
        http.createServer(app).listen(listener.port, listener.host, listener.backlog, function() {
            callback()
        })
    } catch(err) {
        callback(err)
    }
}

listeners.https = function(listener, callback) {
    console.log('Starting HTTPS server on ' + listener.port)
    var opts = _.clone(listener.opts || {})
    async.each(['key', 'cert', 'pfx'],
        function(key, callback) {
            if (opts.hasOwnProperty(key)) {
                var name = path.resolve(argv.config, opts[key])
                debug('Reading ' + name)
                fs.readFile(name, function(err, data) {
                    if (err) {
                        callback(err)
                    } else {
                        opts[key] = data.toString()
                        callback()
                    }
                })
            } else {
                callback()
            }
        },
        function(err) {
            if (err) {
                callback(err)
            } else {
                try {
                    https.createServer(opts, app).listen(listener.port, listener.host, listener.backlog, function() {
                        callback()
                    })
                } catch(err) {
                    callback(err)
                }
            }
        })
}

/* Starting
============================================================================= */

var listen = function(opts, callback) {
    callback = callback || function() {}
    var type = opts.type || 'http'
    var listener = listeners[type]
    listener(opts, callback)
}

var listenerProcessed = function(err) {
    if (err) {
        console.log('Failed to start a server:', err)
    } else {
        debug('All servers have started')
    }
}

if (Array.isArray(config.app.listen)) {
    async.eachSeries(config.app.listen, function(opts, callback) {
        listen(opts, callback)
    }, listenerProcessed)
} else {
    listen(config.app.listen, listenerProcessed)
}

