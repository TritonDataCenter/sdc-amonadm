// Copyright 2013 Joyent, Inc. All rights reserved.

var fs = require('fs');
var path = require('path');

var assert = require('assert-plus');
var clone = require('clone');
var once = require('once');
var vasync = require('vasync');
var hogan = require('hogan.js');

var Queue = require('./queue').Queue;



///--- Helpers

function flatten_probes(opts) {
    assert.object(opts, 'options');
    assert.object(opts.probes, 'options.probes');
    assert.optionalArrayOfString(opts.role, 'options.role');

    var probes = [];

    Object.keys(opts.probes).forEach(function (k) {
        if (opts.role && opts.role.indexOf(k) === -1)
            return;

        opts.probes[k].forEach(function (p) {
            p.role = k;
        });

        probes = probes.concat(opts.probes[k]);
    });

    return (probes);
}


function read_role_files(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.roles, 'options.roles');
    assert.func(cb, 'callback');

    vasync.forEachParallel({
        func: function (r, _cb) {
            _cb = once(_cb);

            var probes = {};
            probes[r] = [];
            var q = new Queue({
                limit: 5,
                worker: function (f, __cb) {
                    fs.readFile(f, 'utf8', function (err2, data) {
                        if (err2) {
                            __cb(err2);
                            return;
                        }

                        var obj;
                        try {
                            obj = JSON.parse(data);
                        } catch (e) {
                            __cb(e);
                            return;
                        }

                        if (Array.isArray(obj)) {
                            obj.forEach(function (o) {
                                if (probes[r].indexOf(o.name) === -1)
                                    probes[r].push(o);
                            });
                        } else {
                            if (probes[r].indexOf(obj.name) === -1)
                                probes[r].push(obj);
                        }

                        __cb();
                    });
                }
            });

            q.once('error', _cb);
            q.once('end', function () {
                _cb(null, probes);
            });

            var done = 0;
            function on_read_dir(err, files, root) {
                if (err) {
                    _cb(err);
                    return;
                }

                (files || []).filter(function (f) {
                    return (/\.json$/.test(f));
                }).map(function (f) {
                    return (path.resolve(root, f));
                }).forEach(function (f) {
                    q.push(f);
                });

                if (++done === opts.roles[r].files.length)
                    q.close();
            }

            opts.roles[r].files.forEach(function (f) {
                fs.readdir(f, function (err, files) {
                    on_read_dir(err, files || null, f);
                });
            });

        },
        inputs: Object.keys(opts.roles)
    }, function (err, results) {
        if (err) {
            cb(err);
            return;
        } else if (!results.successes.length) {
            cb(new Error('no probe definitions found'));
            return;
        }

        var probes = {};
        results.successes.forEach(function (p) {
            var k = Object.keys(p).pop();
            probes[k] = p[k];
        });

        opts.probes = probes;
        cb(null, probes);
    });
}



///--- API

function add_probes(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.amon, 'options.amon');
    assert.object(opts.application, 'options.application');
    assert.number(opts.concurrency, 'options.concurrency');
    assert.arrayOfString(opts.contacts, 'options.contacts');
    assert.object(opts.probes, 'options.probes');
    assert.string(opts.user, 'options.user');
    assert.func(cb, 'callback');

    cb = once(cb);
    opts.count = 0;

    var roles = opts.application.roles;
    var q = new Queue({
        limit: opts.concurrency,
        worker: function (p, _cb) {
            var method;
            if (p.role)
                delete p.role;

            // If there is no uuid then we want to create the probe
            var create = (p.uuid === undefined);

            function onProbe(err, probe, obj) {
                if (err) {
                    return _cb(err);
                }
                var verb = (create ? 'created' : 'updated');
                if (opts.verbose) {
                    opts.log.trace({ probe: probe }, 'Probe %s', probe.uuid);
                }
                console.log('Probe %s has been %s', probe.uuid, verb);
                return _cb(null, probe);
            }

            if (create) {
                opts.amon.createProbe(opts.user, p, onProbe);
            } else {
                // console.log(p);
                opts.amon.putProbe(opts.user, p.uuid, p, onProbe);
            }
        }
    });
    q.once('error', cb);
    q.once('end', cb);

    if (!Object.keys(opts.probes).length) {
        q.close();
        return;
    }

    opts.amon.listProbeGroups(opts.user, function (err, groups) {
        if (err) {
            cb(err);
            return;
        }
        var _groups = {};
        (groups || []).forEach(function (g) {
            _groups[g.name] = g;
        });

        var gq = new Queue({
            limit: 1,
            worker: function (probe, _cb) {
                function _push() {
                    opts.count++;
                    delete probes.role;
                    q.push(probe);
                    _cb();
                }

                if (_groups[probe.role]) {
                    probe.group = _groups[probe.role].uuid;
                    _push();
                    return;
                }

                var _g = {
                    contacts: opts.contacts,
                    name: probe.role
                };
                // TODO: needs to be a config variable
                opts.amon.createProbeGroup('admin', _g, function (_err, g) {
                    if (_err) {
                        _cb(err);
                    } else {
                        _groups[g.name] = g;
                        probe.group = g.uuid;
                        _push();
                    }
                });
            }
        });
        gq.once('error', cb);
        gq.once('end', function () {
            q.close();
        });

        // p1 is existing probe and p2 is probe data from the probe files
        function probeHasChanged(p1, p2) {
            return (p1.type !== p2.type || p1.agent !== p2.agent ||
                JSON.stringify(p1.config) !== JSON.stringify(p2.config));
        }

        var pushed = 0;
        function push(p, vm) {
            pushed++;
            var p2 = clone(p);

            if (p2.global) {
                p2.agent = vm.cn;
                delete p2.global;
            } else {
                p2.agent = vm.uuid;
            }

            // Right now only {{machine}} is a supported metadata value
            var metadata = { machine: p2.agent };
            var rendered = hogan.compile(JSON.stringify(p2)).render(metadata);
            p2 = JSON.parse(rendered);

            var g = _groups[p.role];
            if (g) {
                delete p2.role;
                p2.group = g.uuid;

                // Only do this if the requested action is update and the probe
                // exists for a group that is also present in the probe files
                if (opts.action === 'update' && vm.probes) {
                    vm.probes.forEach(function (probe) {
                        // Assume that are probes are unique by name per group
                        if (probe.group === p2.group &&
                            probe.name === p2.name) {
                            p2.uuid = probe.uuid;
                            p2.disabled = probe.disabled || false;
                            if (!probeHasChanged(probe, p2)) {
                                console.log('Probe %s is unchanged', p2.uuid);
                                return false;
                            }

                            opts.count++;
                            q.push(p2);
                        }
                    });
                } else {
                    q.push(p2);
                }
            } else {
                gq.push(p2);
            }
        }

        var probes = flatten_probes(opts);
        probes.forEach(function (p) {
            if (!roles[p.role]) {
                cb(new Error('role "' + p.role +
                             '" not a valid role'));
                q.close();
                return;
            }

            if (opts.role && opts.role.indexOf(p.role) === -1)
                return;

            if (opts.machine) {
                opts.machine.forEach(function (m) {
                    roles[p.role].forEach(function (vm) {
                        var id;
                        if (p.global) {
                            id = vm.cn;
                        } else {
                            id = vm.uuid;
                        }

                        if (id.contains(m))
                            push(p, vm);
                    });
                });
            } else {
                Object.keys(roles).forEach(function (k) {
                    var r = roles[k];
                    r.forEach(function (vm) {
                        if (p.role === vm.role)
                            push(p, vm);
                    });
                });
            }
        });

        gq.close();
        if (pushed === opts.count)
            q.close();
    });
}


function drop_probes(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.amon, 'options.amon');
    assert.number(opts.concurrency, 'options.concurrency');
    assert.arrayOfObject(opts.probes, 'options.probes');
    assert.arrayOfObject(opts.probeGroups, 'options.probeGroups');
    assert.string(opts.user, 'options.user');
    assert.func(cb, 'callback');

    cb = once(cb);

    var q = new Queue({
        limit: opts.concurrency,
        worker: function (p, _cb) {
            opts.amon.deleteProbe(opts.user, p, _cb);
        }
    });

    opts.probes.forEach(function (p) {
        q.push(p.uuid);
    });

    q.once('error', cb);
    q.once('end', function () {
        if (opts.role && opts.role.length) {
            var rq = new Queue({
                limit: opts.concurrency,
                worker: function (r, _cb) {
                    var g = opts.probeGroups.filter(function (pg) {
                        return (pg.name === r);
                    }).pop();
                    assert.ok(g);
                    opts.amon.deleteProbeGroup(opts.user, g.uuid, _cb);
                }
            });
            rq.once('error', cb);
            rq.once('end', cb);
            opts.role.forEach(rq.push.bind(rq));
            rq.close();
        } else {
            cb();
        }
    });
    q.close();
}


function filter_probes(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.application, 'options.application');
    assert.object(opts.log, 'options.log');
    assert.optionalArrayOfString(opts.machine, 'options.machine');
    assert.optionalArrayOfString(opts.role, 'options.role');
    assert.func(cb, 'callback');

    cb = once(cb);

    if (opts.role && opts.role.length) {
        opts.probes = opts.probes.filter(function (p) {
            return (opts.role.indexOf(p.role) !== -1);
        });
    }

    if (opts.machine && opts.machine.length) {
        opts.probes = opts.probes.filter(function (p) {
            return (opts.machine.some(function (m) {
                return (p.agent.contains(m));
            }));
        });
    }

    cb(null, opts.probes);
}


function list_probes(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.amon, 'options.amon');
    assert.object(opts.log, 'options.log');
    assert.string(opts.user, 'options.user');
    assert.func(cb, 'callback');

    cb = once(cb);

    opts.amon.listProbes(opts.user, function (err, probes) {
        if (err) {
            cb(err);
            return;
        }

        opts.amon.listProbeGroups(opts.user, function (err2, groups) {
            if (err) {
                cb(err);
                return;
            }

            probes = probes.map(function (p) {
                groups.some(function (g) {
                    if (g.uuid === p.group)
                        p.role = g.name;
                    return (p.role !== undefined);
                });
                return (p);
            });

            probes.sort(function (a, b) {
                if (a.role < b.role)
                    return (-1);
                if (a.role > b.role)
                    return (1);
                if (a.agent < b.agent)
                    return (-1);
                if (a.agent > b.agent)
                    return (1);
                if (a.uuid < b.uuid)
                    return (-1);
                if (a.uuid > b.uuid)
                    return (1);
                return (0);
            });

            opts.probes = probes;
            opts.probeGroups = groups;
            cb(null, probes);
        });
    });
}


function read_probe_files(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.log, 'options.log');
    assert.object(opts.application, 'options.application');
    assert.string(opts.application.name, 'options.application.name');
    assert.optionalArrayOfString(opts.role, 'options.role');
    assert.func(cb, 'callback');

    cb = once(cb);

    opts.probes = [];
    var log = opts.log;
    var app = opts.application.name;
    var params = {
        log: log,
        roles: {}
    };

    function _cb(err, probes) {
        if (err) {
            cb(err);
        } else {
            opts.probes = probes;
            cb(err, probes);
        }
    }

    if (opts.role && opts.role.length) {
        opts.role.forEach(function (r) {
            // Ugh, special case "compute"
            params.roles[r] = {
                files: [
                    path.resolve(__dirname, '../', 'probes', app, r)
                ]
            };
            if (r !== 'compute') {
                var c = path.resolve(__dirname, '../', 'probes', app, 'common');
                params.roles[r].files.push(c);
            }
        });
        read_role_files(params, _cb);
        return;
    }

    fs.readdir(path.resolve(__dirname, '../', 'probes', app),
    function (err, files) {
        if (err) {
            cb(err);
            return;
        }

        files.forEach(function (f) {
            if (f === 'common')
                return;

            params.roles[f] = {
                files: [
                    path.resolve(__dirname, '../', 'probes', app, f)
                ]
            };

            if (f !== 'compute') {
                var c = path.resolve(__dirname, '../', 'probes', app, 'common');
                params.roles[f].files.push(c);
            }
        });

        read_role_files(params, _cb);
    });
}



///--- Exports

module.exports = {
    add_probes: add_probes,
    drop_probes: drop_probes,
    filter_probes: filter_probes,
    list_probes: list_probes,
    read_probe_files: read_probe_files
};
