// Copyright 2013 Joyent, Inc. All rights reserved.


///--- Helpers

function _export(obj) {
    Object.keys(obj).forEach(function (k) {
        if (module.exports[k])
            console.error('duplicate export: ' + k);

        module.exports[k] = obj[k];
    });
}



///--- Patches

if (!('contains' in String.prototype)) {
    String.prototype.contains = function (str, startIndex) {
        return (-1 !== String.prototype.indexOf.call(this, str, startIndex));
    };
}



///--- Exports

module.exports = {};

_export(require('./alarms'));
_export(require('./probes'));
_export(require('./queue'));
_export(require('./topo'));
