/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

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
