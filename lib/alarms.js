// Copyright 2013 Joyent, Inc. All rights reserved.

var assert = require('assert-plus');
var LRU = require('lru-cache');
var once = require('once');

var Queue = require('./queue').Queue;



///--- Helpers

function resolve_probes(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.amon, 'options.amon');
    assert.number(opts.concurrency, 'options.concurrency');
    assert.string(opts.user, 'options.user');
    assert.func(cb, 'callback');

    cb = once(cb);

    var amon = opts.amon;
    var lru = LRU();
    var q = new Queue({
        limit: opts.concurrency,
        worker: function (a, _cb) {
            amon.getProbe(opts.user, a.probe, function (err, p) {
                if (err) {
                    if (err.statusCode === 404) {
                        a.probe = {
                            name: 'UNKNOWN',
                            role: 'UNKNOWN'
                        };
                        _cb();
                        return;
                    }
                    _cb(err);
                    return;
                }

                a.probe = p;
                if (!lru.get(p.group)) {
                    amon.getProbeGroup(opts.user, p.group, function (err2, g) {
                        if (err2) {
                            _cb(err2);
                        } else {
                            lru.set(g.uuid, g);
                            p.role = lru.get(g.uuid).name;
                            _cb();
                        }
                    });
                } else {
                    p.role = lru.get(p.group).name;
                    _cb();
                }
            });
        }
    });

    q.once('error', cb);
    q.once('end', cb);

    opts.alarms.forEach(function (a) {
        q.push(a);
    });

    q.close();
}



///--- API

function close_alarms(opts, cb) {
    assert.object(opts, 'options');
    assert.arrayOfObject(opts.alarms, 'options.alarms');
    assert.object(opts.amon, 'options.amon');
    assert.number(opts.concurrency, 'options.concurrency');
    assert.string(opts.user, 'options.user');
    assert.func(cb, 'callback');

    cb = once(cb);

    var q = new Queue({
        limit: opts.concurrency,
        worker: function (id, _cb) {
            opts.amon.closeAlarm(opts.user, id, _cb);
        }
    });

    q.once('error', cb);
    q.once('end', cb);

    opts.alarms.forEach(function (a) {
        q.push(a.id);
    });

    q.close();
}


function filter_alarms(opts, cb) {
    assert.object(opts, 'options');
    assert.arrayOfObject(opts.alarms, 'options.alarms');
    assert.func(cb, 'callback');

    cb = once(cb);

    if (opts.role && opts.role.length) {
        opts.alarms = opts.alarms.filter(function (a) {
            return (opts.role.indexOf(a.probe.role) === -1);
        });
    }

    if (opts.machine && opts.machine.length) {
        opts.alarms = opts.alarms.filter(function (a) {
            return (opts.machine.some(function (m) {
                return (a.machine.contains(m));
            }));
        });
    }

    cb(null, opts.alarms);
}


function list_alarms(opts, cb) {
    assert.object(opts, 'options');
    assert.object(opts.amon, 'options.amon');
    assert.string(opts.user, 'options.user');
    assert.func(cb, 'callback');

    cb = once(cb);

    var params = {
        state: 'open'
    };

    opts.amon.listAlarms(opts.user, params, function (err, alarms) {
        if (err) {
            cb(err);
            return;
        }

        var faults = [];
        alarms.forEach(function (a) {
            a.faults.forEach(function (f) {
                faults.push({
                    id: a.id,
                    machine: f.event.agent,
                    probe: f.probe,
                    data: f.event.data
                });
            });
        });

        faults.sort(function (a, b) {
            if (a.id < b.id)
                return (-1);
            if (a.id > b.id)
                return (1);
            if (a.machine < b.machine)
                return (-1);
            if (a.machine > b.machine)
                return (1);
            if (a.probe < b.probe)
                return (-1);
            if (a.probe > b.probe)
                return (1);
            return (0);
        });

        opts.alarms = faults;
        resolve_probes(opts, cb);
    });
}



///--- Exports

module.exports = {
    close_alarms: close_alarms,
    filter_alarms: filter_alarms,
    list_alarms: list_alarms
};
