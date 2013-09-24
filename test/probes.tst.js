// Copyright 2013 Joyent, Inc. All rights reserved.

var bunyan = require('bunyan');
var fs = require('fs');
var path = require('path');
var sdc = require('sdc-clients');
var test = require("tap").test;

var mantamon = require('../lib');



///--- Globals

var AMON;
var APPLICATION;
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
    cfg.amon.log = LOG;
    cfg.sapi.log = LOG;
    cfg.vmapi.log = LOG;

    AMON = new sdc.Amon(cfg.amon);
    t.ok(AMON);

    SAPI = new sdc.SAPI(cfg.sapi);
    t.ok(SAPI);

    VMAPI = new sdc.VMAPI(cfg.vmapi);
    t.ok(VMAPI);

    var opts = {
        application: {
            name: 'sdc'
        },
        log: LOG,
        sapi: SAPI,
        vmapi: VMAPI
    };
    mantamon.load_application(opts, function (err, app) {
        t.ifError(err);
        t.ok(app);
        APPLICATION = app;
        t.end();
    });
});


test('list probes', function (t) {
    var opts = {
        amon: AMON,
        application: APPLICATION,
        log: LOG,
        sapi: SAPI,
        vmapi: VMAPI,
        user: 'admin'
    };
    mantamon.list_probes(opts, function (err, probes) {
        t.ifError(err);
        t.ok(probes);
        if (err || !probes) {
            t.end();
            return;
        }

        t.end();
    });
});


test('filter probes by role', function (t) {
    var opts = {
        amon: AMON,
        application: APPLICATION,
        log: LOG,
        sapi: SAPI,
        vmapi: VMAPI,
        // TODO: fix initial probe creation on sdc
        role: ['vmapi-4337d96d-9302-4133-a4d8-0e0b020f2aad'],
        user: 'admin'
    };
    mantamon.list_probes(opts, function (err) {
        t.ifError(err);

        mantamon.filter_probes(opts, function (err2, probes) {
            t.ifError(err2);
            t.ok(probes);
            t.ok(probes.length);

            probes.forEach(function (p) {
                t.equal(p.role, opts.role[0]);
            });

            t.end();
        });
    });
});


test('filter probes by machine', function (t) {
    var opts = {
        amon: AMON,
        application: APPLICATION,
        log: LOG,
        sapi: SAPI,
        vmapi: VMAPI,
        // TODO: for now, pass a UUID for this test to work
        machine: [Object.keys(APPLICATION.zones).pop()],
        // machine: ['51dd7430-99b4-4bd8-b76e-eda67590a6ff'],
        user: 'admin'
    };
    mantamon.list_probes(opts, function (err, ps) {
        t.ifError(err);
        opts.probes = ps;
        mantamon.filter_probes(opts, function (err2, probes) {
            t.ifError(err2);
            t.ok(probes);
            t.ok(probes.length);

            probes.forEach(function (p) {
                t.equal(p.agent, opts.machine[0]);
            });

            t.end();
        });
    });
});


test('read probe files (all)', function (t) {
    var opts = {
        log: LOG
    };
    mantamon.read_probe_files(opts, function (err, probes) {
        t.ifError(err);
        t.ok(probes);
        if (err || !probes) {
            t.end();
            return;
        }
        t.ok(probes.storage);
        t.ok(Array.isArray(probes.storage));
        t.ok(probes.storage.length);
        t.ok(probes.nameservice);
        t.ok(Array.isArray(probes.nameservice));
        t.ok(probes.nameservice.length);
        t.end();
    });
});


test('read probe files (by role)', function (t) {
    var opts = {
        log: LOG,
        role: ['nameservice']
    };
    mantamon.read_probe_files(opts, function (err, probes) {
        t.ifError(err);
        t.ok(probes);
        if (err || !probes) {
            t.end();
            return;
        }

        t.notOk(probes.marlin);
        t.ok(probes.nameservice);
        t.ok(Array.isArray(probes.nameservice));
        t.ok(probes.nameservice.length);
        t.end();
    });
});


test('shutdown', function (t) {
    AMON.close();
    SAPI.close();
    VMAPI.close();
    t.end();
});
