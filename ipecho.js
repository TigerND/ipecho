/* -*- coding: utf-8 -*-
============================================================================= */
/*jshint asi: true*/

var path = require('path')

var config = require('konfig')({
    path: path.join(__dirname, 'config')
})

var morgan = require('morgan')

var log = null
if (config.app.debug) {
    log = morgan('dev')
} else {
    log = morgan('combined')
}

var fs = require("fs"),
    util = require("util"),
    express = require('express'),
    http = require('http'),
    Handlebars = require('handlebars'),
    yaml = require('js-yaml')
    
/* Express
============================================================================= */

var template = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, '/templates/ipecho.html')).toString()
)

/* Express
============================================================================= */

var favicon = require('serve-favicon')

var app = express()
app.use(log)

var server = app.listen(config.app.port)

app.use(favicon(path.join(__dirname, '/static/favicon.ico')))

if (config.app.cors) {
    app.use(function(req, res, next) {
        res.header('Access-Control-Allow-Origin', config.app.cors);
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    })
}

/* Handlers
============================================================================= */

var handlers = []

handlers.push({type: "text", hndl: function(req, res, address, type) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(address.toString())
}})

handlers.push({type: "json", hndl: function(req, res, address, type) {
    res.json({ip: address})
}})

var yaml_types = ["text/yaml", "text/x-yaml", "application/yaml", "application/x-yaml"]
yaml_types.forEach(function(content_type) {
    handlers.push({type: content_type, hndl: function(req, res, address, type) {
        res.writeHead(200, {'Content-Type': type});
        res.end(yaml.safeDump({ip: address}))
    }})
})

handlers.push({type: "html", hndl: function(req, res, address, type) {
    res.end(template({address: address, config: config.app}))
}})

/* Http API
============================================================================= */

var types = []
handlers.forEach(function(v) {
    types.push(v.type)
})

app.get('/', function(req, res) {
    var accepts = req.accepts(types)
    var address = req.headers['x-real-ip'] ||
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress ||
                  req.connection.socket.remoteAddress
    var not_found = handlers.every(function(v) {
        if (accepts == v.type) {
            v.hndl(req, res, address, v.type)
            return false
        }
        return true
    })
    if (not_found) {
        handlers[handlers.length - 1].hndl(req, res, address)
    }
})

/* Admin interface
============================================================================= */

app.use('/static', express.static(__dirname + '/static'))
app.use(express.static(__dirname + '/public'))

