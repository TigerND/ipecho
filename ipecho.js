/* -*- coding: utf-8 -*-
============================================================================= */
/*jshint asi: true*/

var debug = require('debug')('ipecho:main')

var path = require('path')

var fs = require("fs-extra"),
    util = require("util"),
    express = require('express'),
    http = require('http'),
    Handlebars = require('handlebars'),
    yaml = require('js-yaml')
    
/* Config
============================================================================= */

var configName = 'app.json'

var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE
fs.ensureDirSync(home)

var configPath = path.join(home, '.ipecho/config')
fs.ensureDirSync(configPath)

var configFile = path.join(configPath, configName)
if (!fs.existsSync(configFile)) {
    fs.copySync(path.join(__dirname, 'config/' + configName), configFile)
}
debug('Reading config from ' + configFile)
var config = require('konfig')({
    path: configPath
})

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

var server = app.listen(config.app.port)

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

registerHandler("text/plain", "text", function(req, res, address, type) {
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(address.toString())
})

registerHandler("application/json", "json", function(req, res, address, type) {
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(JSON.stringify({
        ip: address
    }))
})

registerHandler([
    "text/yaml",
    "text/x-yaml",
    "application/yaml",
    "application/x-yaml"
], "yaml", function(req, res, address, type) {
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(yaml.safeDump({
        ip: address
    }))
})

registerHandler("text/html", 'html', function(req, res, address, type) {
    res.writeHead(200, {
        'Content-Type': type
    });
    res.end(template({
        address: address,
        supportedTypes: supportedTypes,
        config: config.app
    }))
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
        description: 'Invalid content type.',
        supportedTypes: supportedTypes,
        config: config.app
    }))
}

var extractAddress = function(req) {
    var real_ip = req.headers['x-real-ip']
    var x_forwarded_server = req.headers['x-forwarded-server']
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
    return address
}

app.get('/', function(req, res) {
    var address = extractAddress(req)
    var accepts = req.accepts(acceptedTypes)
    var not_found = handlersList.every(function(v) {
        if (accepts == v.contentType) {
            v.hndl(req, res, address, v.contentType)
            return false
        }
        return true
    })
    if (not_found) {
        responseError(req, res, 400, 'Invalid content type.')
    }
})

//app.param('mimeType', /^\w+$/);
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

/* Admin interface
============================================================================= */

app.use('/static', express.static(__dirname + '/static'))
app.use(express.static(__dirname + '/public'))

