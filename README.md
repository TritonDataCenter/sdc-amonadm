# amonadm

Repository: <git@git.joyent.com:amonadm.git>
Browsing: <https://mo.joyent.com/amonadm>
Who: Andres Rodriguez, Trent Mick
Tickets/bugs: <https://devhub.joyent.com/jira/browse/MON>


# tl;dr

This repo contains `amonadm`, which is the administrative tool that manages
operational bits for an SDC datacenter. You should be familiar with Amon
already, so if you're not, go get familar.

This tool probes/alarms for an SDC datacenter.

There is full documentation installed with it as a manpage, so in an sdc
deployment zone just do `man amonadm`.

# Probes

All probe files are stored by role under `/probes`.  In addition there is a
`common` directory that *all* roles will also pull in (the exception being
`compute`, which does not pull those in).

The probe files themselves are just JSON blobs that match what Amon wants,
minus the `agent` bit.  If you want a probe to run in the GZ of a service's
zone, just set the field `global: true` in the JSON blob (this is not an
Amon thing, but amonadm figures it out for you).

# Repository

    deps/           Git submodules and/or commited 3rd-party deps should go
                    here. See "node_modules/" for node.js deps.
    docs/           Project docs (restdown)
    lib/            Source files.
    node_modules/   Node.js deps, either populated at build time or commited.
                    See Managing Dependencies.
    man/            Man pages
    probes/         Probe definitions
    test/           Test suite (using node-tap)
    tools/          Miscellaneous dev/upgrade/deployment tools and data.
    main.js         The actual command
    Makefile
    package.json    npm module info (holds the project version)
    README.md


# Development

To run the boilerplate API server:

    git clone git@git.joyent.com:amonadm.git
    cd amonadm
    npm install
    export AMONADM_CFG_FILE=$PWD/etc/config.coal.json
    node main.js

To update the man page, edit "docs/man/amonadm.md" and run `make pages`
to update "man/man1/amonadm.1".

Before commiting/pushing run `make prepush` and, if possible, get a code
review.


# Testing

    npm test

And you know, use the CLI.
