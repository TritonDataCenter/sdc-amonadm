#!/usr/bin/env node
// Copyright 2013 Joyent, Inc. All rights reserved.

var fs = require('fs');
var path = require('path');
var util = require('util');

var assert = require('assert-plus');
var bunyan = require('bunyan');
var carrier = require('carrier');
var clone = require('clone');
var cmdln = require('cmdln');
var once = require('once');
var restify = require('restify');
var sdc = require('sdc-clients');
var sprintf = require('extsprintf').sprintf;
var vasync = require('vasync');

var amonadm = require('./lib');




///--- Globals

var Amon = sdc.Amon;
var VMAPI = sdc.VMAPI;

var COMMON_FUNCS = [
    setup_logger,
    read_config_file,
    setup_clients
];

var DEFAULT_OPTIONS = [
    {
        names: ['file', 'f'],
        type: 'string',
        help: 'configuration file',
        'default': '/opt/smartdc/sdc/etc/amonadm.config.json',
        helpArg: 'CONFIG_FILE',
        env: 'AMONADM_CFG_FILE'
    }, {
        names: ['verbose', 'v'],
        type: 'bool',
        help: 'turn on verbose logging',
        'default': false
    }
];

var LOG = bunyan.createLogger({
    name: path.basename(process.argv[1]),
    level: (process.env.LOG_LEVEL || 'fatal'),
    stream: process.stderr,
    serializers: restify.bunyan.serializers
});

//-- Hard-coded Amon contact names. This must exist in UFDS.
var USER_CONTACTS = ['email', 'pagerdutyemail'];



///--- Functions

function xor() {
    var b = false;
    for (var i = 0; i < arguments.length; i++) {
        if (arguments[i] && !b) {
            b = true;
        } else if (arguments[i] && b) {
            return (false);
        }
    }
    return (b);
}


function read_config_file(opts, cb) {
    assert.object(opts, 'options');
    assert.string(opts.file, 'file');
    assert.func(cb, 'callback');

    cb = once(cb);

    var f = path.normalize(opts.file);
    var log = opts.log.child({file: f}, true);
    fs.readFile(f, 'utf8', function (err, data) {
        if (err) {
            log.error(err, 'read_config_file: error');
            cb(err);
            return;
        }
        var obj;
        try {
            obj = JSON.parse(data);
        } catch (e) {
            cb(e);
            return;
        }

        log.debug({
            config: obj
        }, 'read_config_file: parsed');

        opts.config = obj;

        opts.config.amon.log = opts.log.child({component: 'amon'}, true);
        opts.config.sapi.log = opts.log.child({component: 'sapi'}, true);
        opts.config.vmapi.log = opts.log.child({component: 'vmapi'}, true);

        cb();
    });
}


function setup_clients(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.config, 'options.config');
    assert.object(opts.log, 'options.log');
    assert.func(cb, 'callback');

    cb = once(cb);

    opts.amon = new sdc.Amon(opts.config.amon);
    opts.sapi = new sdc.SAPI(opts.config.sapi);
    opts.vmapi = new sdc.VMAPI(opts.config.vmapi);
    opts.user = opts.config.user;
    opts.contacts = USER_CONTACTS;

    var params = {
        application: {
            name: opts.config.application,
            role_key: opts.config.role_key
        },
        log: LOG,
        sapi: opts.sapi,
        vmapi: opts.vmapi
    };
    amonadm.load_application(params, function (err, app) {
        if (err) {
            cb(err);
        } else {
            opts.application = app;
            cb();
        }
    });
}


function setup_logger(opts, cb) {
    assert.object(opts, 'options');
    assert.func(cb, 'callback');

    if (opts.verbose) {
        opts.log = LOG.child({
            level: 'trace'
        });
    } else {
        opts.log = LOG;
    }

    process.nextTick(cb);
}



///--- API

function AmonAdm() {
    cmdln.Cmdln.call(this, {
        name: 'sdc-amonadm',
        desc: 'Manages AMON probes for a SAPI application'
    });
}
util.inherits(AmonAdm, cmdln.Cmdln);


//-- Add

AmonAdm.prototype.do_add = function do_add(subcmd, opts, args, cb) {
    vasync.pipeline({
        funcs: COMMON_FUNCS.concat([
            amonadm.read_probe_files,
            amonadm.add_probes,
            function print(_, _cb) {
                console.log('added %d probes', opts.count);
                _cb();
            }
        ]),
        arg: opts
    }, once(cb));
};
AmonAdm.prototype.do_add.options = DEFAULT_OPTIONS.concat([
    {
        names: ['concurrency'],
        type: 'positiveInteger',
        help: 'number of probes to add in parallel',
        helpArg: 'LIMIT',
        'default': 5
    },
    {
        names: ['machine', 'm'],
        type: 'arrayOfString',
        help: 'machine to list probes for (specify multiple times)',
        helpArg: 'MACHINE_UUID'
    },
    {
        names: ['role', 'r'],
        type: 'arrayOfString',
        help: 'role to create probes for',
        helpArg: 'role name'
    }
]);
AmonAdm.prototype.do_add.help = (
    'Adds all probes for a given role or machine.\n' +
        'The default is to add all probes for all roles\n' +
        'Example:\n' +
        '    sdc-amonadm add -m f1289c4a-d56a-41d9-803b-7b1322ec2f29\n' +
        '\n' +
        'Usage:\n' +
        '     sdc-amonadm add [OPTIONS]\n' +
        '\n' +
        '{{options}}'
);


//-- Drop

AmonAdm.prototype.do_drop = function do_drop(subcmd, opts, args, cb) {
    if ((opts.machine || opts.role) && !xor(opts.machine, opts.role)) {
        cb(new Error('--machine and --role cannot both be specified'));
        return;
    }

    vasync.pipeline({
        funcs: COMMON_FUNCS.concat([
            amonadm.list_probes,
            amonadm.filter_probes,
            amonadm.drop_probes,
            function print(_, _cb) {
                console.log('dropped %d probes', opts.probes.length);
                _cb();
            }
        ]),
        arg: opts
    }, once(cb));
};
AmonAdm.prototype.do_drop.options = DEFAULT_OPTIONS.concat([
    {
        names: ['concurrency'],
        type: 'positiveInteger',
        help: 'number of probes to delete in parallel',
        helpArg: 'LIMIT',
        'default': 5
    },
    {
        names: ['machine', 'm'],
        type: 'arrayOfString',
        help: 'machine to list probes for (specify multiple times)',
        helpArg: 'MACHINE_UUID'
    },
    {
        names: ['quiet', 'q'],
        type: 'bool',
        help: 'do not output probe ids that are dropped'
    },
    {
        names: ['role', 'r'],
        type: 'arrayOfString',
        help: 'role to drop probes for',
        helpArg: 'MANTA_ROLE_NAME'
    }
]);
AmonAdm.prototype.do_drop.help = (
    'Drops all probes for a datacenter/machine.\n' +
        'Example:\n' +
        '    sdc-amonadm drop -m f1289c4a-d56a-41d9-803b-7b1322ec2f29\n' +
        '\n' +
        'Usage:\n' +
        '     sdc-amonadm drop [OPTIONS]\n' +
        '\n' +
        '{{options}}'
);


//-- Get

AmonAdm.prototype.do_probe = function do_probe(subcmd, opts, args, cb) {
    if (args.length < 1) {
        cb(new Error('At least one Probe UUID must be specified'));
        return;
    }

    vasync.pipeline({
        funcs: COMMON_FUNCS.concat([
            amonadm.list_probes,
            function print(_, _cb) {
                var probes = [];
                args.forEach(function (a) {
                    opts.probes.forEach(function (p) {
                        if (p.uuid.contains(a))
                            probes.push(p);
                    });
                });
                console.log(JSON.stringify(probes, null, 2));
                _cb();
            }
        ]),
        arg: opts
    }, once(cb));
};
AmonAdm.prototype.do_probe.options = DEFAULT_OPTIONS.slice(0);
AmonAdm.prototype.do_probe.help = (
    'Fetches probe(s) by uuid.\n' +
        'Example:\n' +
        /* JSSTYLED */
        '    sdc-amonadm getprobe 98152930-c0e9-4b71-99fc-be6f5c920cc3 99d6647f-d112-4dba-8a4d-9fef4c55cdb7\n' +
        '\n' +
        'Usage:\n' +
        '     sdc-amonadm getprobe [OPTIONS] PROBE_UUID...\n' +
        '\n' +
        '{{options}}'
);


//-- List

AmonAdm.prototype.do_probes = function do_probes(_, opts, args, cb) {
    vasync.pipeline({
        funcs: COMMON_FUNCS.concat([
            amonadm.list_probes,
            amonadm.filter_probes,
            function print(__, _cb) {
                var fmt = '%-18s %-8s %-8s %s';
                if (!opts.H) {
                    var h = sprintf(fmt, 'ROLE', 'MACHINE', 'PROBE', 'NAME');
                    console.log(h);
                }

                opts.probes.forEach(function (p) {
                    console.log(sprintf(fmt,
                                        // TODO: make sure we always have a role
                                        p.role || '', // Role can be absent
                                        p.agent.substr(0, 7),
                                        p.uuid.substr(0, 7),
                                        p.name));
                });

                _cb();
            }
        ]),
        arg: opts
    }, once(cb));
};
AmonAdm.prototype.do_probes.options = DEFAULT_OPTIONS.concat([
    {
        names: ['H'],
        type: 'bool',
        help: 'do not emit header line',
        'default': false
    },
    {
        names: ['machine', 'm'],
        type: 'arrayOfString',
        help: 'machine to list probes for (specify multiple times)',
        helpArg: 'MACHINE_UUID'
    },
    {
        names: ['role', 'r'],
        type: 'arrayOfString',
        help: 'role to list probes for (specify multiple times)',
        helpArg: 'ROLE_NAME'
    }
]);
AmonAdm.prototype.do_probes.help = (
    'Lists all probes for a datacenter.\n' +
        'Example:\n' +
        '    sdc-amonadm probes\n' +
        '\n' +
        'Usage:\n' +
        '     sdc-amonadm probes [OPTIONS]\n' +
        '\n' +
        '{{options}}'
);



//-- Alarms

AmonAdm.prototype.do_alarm = function do_alarm(_, opts, args, cb) {
    if (!args.length) {
        cb(new Error('At least one alarm id required'));
        return;
    }
    vasync.pipeline({
        funcs: COMMON_FUNCS.concat([
            amonadm.list_alarms,
            amonadm.filter_alarms,
            function print(__, _cb) {
                var alarms = [];
                args.forEach(function (id) {
                    id = parseInt(id, 10);
                    opts.alarms.forEach(function (a) {
                        a.id = parseInt(a.id, 10);
                        if (a.id === id)
                            alarms.push(a);
                    });
                });
                console.log(JSON.stringify(alarms, null, 2));
                _cb();
            }
        ]),
        arg: opts
    }, once(cb));
};
AmonAdm.prototype.do_alarm.options = DEFAULT_OPTIONS.concat([
    {
        names: ['concurrency'],
        type: 'positiveInteger',
        help: 'number of probes to delete in parallel',
        helpArg: 'LIMIT',
        'default': 5
    }
]);
AmonAdm.prototype.do_alarm.help = (
    'Gets details for an alarm in a datacenter.\n' +
        'Example:\n' +
        '    sdc-amonadm alarm 37\n' +
        '\n' +
        'Usage:\n' +
        '     sdc-amonadm alarm ID..\n' +
        '\n' +
        '{{options}}'
);


AmonAdm.prototype.do_alarms = function do_alarms(_, opts, args, cb) {
    vasync.pipeline({
        funcs: COMMON_FUNCS.concat([
            amonadm.list_alarms,
            amonadm.filter_alarms,
            function print(__, _cb) {
                var fmt = '%-4s %-18s %-8s %s';
                if (!opts.H)
                    console.log(sprintf(fmt, 'ID', 'ROLE', 'MACHINE', 'PROBE'));

                opts.alarms.forEach(function (a) {
                    console.log(sprintf(fmt,
                                        a.id,
                                        a.probe.role,
                                        a.machine.substr(0, 7),
                                        a.probe.name));
                });

                _cb();
            }
        ]),
        arg: opts
    }, once(cb));
};
AmonAdm.prototype.do_alarms.options = DEFAULT_OPTIONS.concat([
    {
        names: ['concurrency'],
        type: 'positiveInteger',
        help: 'number of probes to delete in parallel',
        helpArg: 'LIMIT',
        'default': 5
    },
    {
        names: ['H'],
        type: 'bool',
        help: 'do not emit header line',
        'default': false
    },
    {
        names: ['machine', 'm'],
        type: 'arrayOfString',
        help: 'machine to list probes for (specify multiple times)',
        helpArg: 'MACHINE_UUID'
    },
    {
        names: ['role', 'r'],
        type: 'arrayOfString',
        help: 'role to list probes for (specify multiple times)',
        helpArg: 'ROLE_NAME'
    }
]);
AmonAdm.prototype.do_alarms.help = (
    'Lists all alarms for a datacenter.\n' +
        'Example:\n' +
        '    sdc-amonadm alarms\n' +
        '\n' +
        'Usage:\n' +
        '     sdc-amonadm alarms [OPTIONS]\n' +
        '\n' +
        '{{options}}'
);


AmonAdm.prototype.do_close = function do_close(_, opts, args, cb) {
    vasync.pipeline({
        funcs: COMMON_FUNCS.concat([
            amonadm.list_alarms,
            amonadm.filter_alarms,
            function filter_alarms_by_id(__, _cb) {
                if (args.length) {
                    opts.alarms = opts.alarms.filter(function (a) {
                        return (args.indexOf(a.id + '') !== -1);
                    });
                }
                _cb();
            },
            amonadm.close_alarms
        ]),
        arg: opts
    }, once(cb));
};
AmonAdm.prototype.do_close.options = DEFAULT_OPTIONS.concat([
    {
        names: ['concurrency'],
        type: 'positiveInteger',
        help: 'number of probes to delete in parallel',
        helpArg: 'LIMIT',
        'default': 5
    },
    {
        names: ['machine', 'm'],
        type: 'arrayOfString',
        help: 'machine to list probes for (specify multiple times)',
        helpArg: 'MACHINE_UUID'
    },
    {
        names: ['role', 'r'],
        type: 'arrayOfString',
        help: 'role to list probes for (specify multiple times)',
        helpArg: 'ROLE_NAME'
    }
]);
AmonAdm.prototype.do_close.help = (
    'Closes alarms for a datacenter.\n' +
        'You must specify one of -m, -r or a list of ids\n' +
        'Example:\n' +
        '    sdc-amonadm close 1 3 5\n' +
        '    sdc-amonadm close -r nameservice\n' +
        '    sdc-amonadm close -m f8d02c7e-dc5c-11e2-9a6b-6fca0b458a96\n' +
        '\n' +
        'Usage:\n' +
        '     sdc-amonadm close [OPTIONS] [id...]\n' +
        '\n' +
        '{{options}}'
);


///--- Mainline

(function main() {
    cmdln.main(AmonAdm);
})();
