// Copyright 2013 Joyent, Inc. All rights reserved.

var bunyan = require('bunyan');
var fs = require('fs');
var path = require('path');
var sdc = require('sdc-clients');
var test = require("tap").test

var load_application = require('../lib').load_application;



///--- Globals

var LOG = bunyan.createLogger({
    name: 'topo.tst',
    level: process.env.LOG_LEVEL || 'info',
    serializers: bunyan.stdSerializers,
    stream: process.stderr
});
var SAPI;
var VMAPI;



///--- Tests

test('setup', function (t) {
    var f = process.env.MANTAMON_CFG_FILE ||
        path.resolve(__dirname, '../etc/config.json');
    var cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
    cfg.sapi.log = LOG;
    cfg.vmapi.log = LOG;

    SAPI = new sdc.SAPI(cfg.sapi);
    t.ok(SAPI);

    VMAPI = new sdc.VMAPI(cfg.vmapi);
    t.ok(VMAPI);

    t.end();
});


test('load manta application', function (t) {
    var opts = {
        application: {
            name: 'sdc'
        },
        log: LOG,
        sapi: SAPI,
        vmapi: VMAPI
    };
    load_application(opts, function (err, app) {
        t.ifError(err);
        t.ok(app);
        t.ok(app.roles);
        t.ok(app.servers);
        t.ok(app.zones);
        if (err || !app) {
            t.end();
            return;
        }
        t.equal(app.name, 'sdc');
        t.ok(app.uuid);
        // t.ok(app.roles.authcache);
        // t.ok(app.roles.compute);
        // t.ok(app.roles['electric-moray']);
        // t.ok(app.roles.jobpuller);
        // t.ok(app.roles.jobsupervisor);
        // t.ok(app.roles.loadbalancer);
        // t.ok(app.roles.moray);
        // t.ok(app.roles.nameservice);
        // t.ok(app.roles.postgres);
        // t.ok(app.roles.storage);
        // t.ok(app.roles.webapi);

        t.end();
    });
});


test('shutdown', function (t) {
    SAPI.close();
    VMAPI.close();
    t.end();
});
