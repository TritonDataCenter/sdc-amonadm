# mantamon

Repository: <git@git.joyent.com:mantamon.git>
Browsing: <https://mo.joyent.com/mantamon>
Who: Mark Cavage
Tickets/bugs: <https://devhub.joyent.com/jira/browse/MANTA>


# tl;dr

This repo contains `mantamon`, which is the administrative tool that manages
operational bits for Manta.  You should be familiar with Amon already, so if
you're not, go get familar.

This tool is installed in each datacenter where Manta is running, and manages
probes/alarms for that datacenter.

There is full documentation installed with it as a manpage, so in a manta
deployment zone just do `man mantamon`.

However, if you're an engineer and want to define additional probes for manta,
read on.

# Probes

All probe files are stored by role under `/probes`.  In addition there is a
`common` directory that *all* roles will also pull in (the exception being
`compute`, which does not pull those in).

The probe files themselves are just JSON blobs that match what Amon wants,
minus the `agent` bit.  If you want a probe to run in the GZ of a service's
zone, just set the field `global: true` in the JSON blob (this is not an
Amon thing, but mantamon figures it out for you).

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

    git clone git@git.joyent.com:mantamon.git
    cd mantamon
    npm install
    export MANTAMON_CFG_FILE=$PWD/etc/config.coal.json
    node main.js

To update the man page, edit "docs/man/mantamon.md" and run `make pages`
to update "man/man1/mantamon.1".

Before commiting/pushing run `make prepush` and, if possible, get a code
review.


# Testing

    npm test

And you know, use the CLI.
