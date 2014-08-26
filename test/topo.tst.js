/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

var bunyan = require('bunyan');
var fs = require('fs');
var path = require('path');
var sdc = require('sdc-clients');
var test = require("tap").test;

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
var AMON;
var cfg;


///--- Tests

test('setup', function (t) {
    var f = process.env.AMONADM_CFG_FILE ||
        path.resolve(__dirname, '../etc/config.json');
    cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
    cfg.sapi.log = LOG;
    cfg.vmapi.log = LOG;

    SAPI = new sdc.SAPI(cfg.sapi);
    t.ok(SAPI);

    VMAPI = new sdc.VMAPI(cfg.vmapi);
    t.ok(VMAPI);

    AMON = new sdc.Amon(cfg.amon);
    t.ok(VMAPI);

    t.end();
});


test('load application', function (t) {
    var opts = {
        application: {
            name: 'sdc',
            role_key: 'smartdc_role'
        },
        log: LOG,
        sapi: SAPI,
        vmapi: VMAPI,
        amon: AMON,
        user: cfg.user
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
        t.ok(app.roles.imgapi);
        t.ok(app.roles.vmapi);

        t.end();
    });
});


test('shutdown', function (t) {
    SAPI.close();
    VMAPI.close();
    AMON.close();
    t.end();
});
