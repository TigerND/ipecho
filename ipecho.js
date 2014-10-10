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
    log = morgan()
}

var fs = require("fs"),
    path = require("path"),
    util = require("util"),
    express = require('express'),
    http = require('http'),
    Handlebars = require('handlebars')
    
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

handlers.push({type: "text", hndl: function(req, res, address) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(address.toString())
}})

handlers.push({type: "json", hndl: function(req, res, address) {
    res.json(address)
}})

handlers.push({type: "html", hndl: function(req, res, address) {
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
    var address = req.headers['x-forwarded-for'] || 
                  req.headers['x-real-ip'] ||
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress ||
                  req.connection.socket.remoteAddress
    handlers.forEach(function(v) {
        if (accepts == v.type) {
            v.hndl(req, res, address)
        }
    })
})

/* Admin interface
============================================================================= */

app.use('/static', express.static(__dirname + '/static'))
app.use(express.static(__dirname + '/public'))

