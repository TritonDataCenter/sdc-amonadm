amonadm 1 "Amon Administrator Commands"
===========================================================

NAME
----

amonadm - Manage Amon probes and alarms for a datacenter

SYNOPSIS
--------

`amonadm` [OPTION...] command [command-specific arguments]

DESCRIPTION
-----------

amonadm manages Amon probes and alarms for services within a single datacenter.
The most common operation(s) will be listing, viewing and closing
alarms, however probe management is typically done at deployment time.

A few notes on how amonadm sets up probes in Amon:

- Each "service" is a probe group.  This means that all alarms for a service
  even on different machines only results in one page.  It is expected that
  operators upon getting an alert/page investigate the state of the system fully
  with `amonadm alarms`.
- Probes are added for a machine/role by combining the role name with all the
  probes under `common`; the exception is `global`, which is for GZ (global
  zone) defined probes.
- amonadm is not idempotent; calling `add` twice on a role/machine will just
  double up all the probes. Use `update` for updating all installed probes.


The commands that you'll use on "live" systems are mostly:

- probes/probe
- alarms/alarm
- close

And then there are "deployment" related commands:

- add
- update
- drop

`add` puts new probes into the system by reading all the definitions in
`./probes`.  Note it doesn't try to do any reconciliation of existing
probes, so if you specify that you want to add for a role or machine (or
all), it's going to just append in everything it finds.

`update` will do three things: update existing probes, drop probes that are
installed but no longer exist defiend in the probe files and add new probes.

`drop` will remove every probe that matches the specified options.

Before describing the detailed options for each command, some sample workflows
are given illustrating how to use amonadm.

EXAMPLE: Managing open alarms
-----------------------------

Here I inserted a sample "LogScan Error" alarm into a `nameservice` zone:

    amonadm alarms
    ID   ROLE               MACHINE  PROBE
    41   nameservice        12b82cd  ZK: logscan 'ERROR'

Above we see an abbreviated listing of alarms that have fired. We can view details
with:

    amonadm alarm 41
    [ {
      "id": 41,
      "machine": "12b82cda-6466-439f-8b82-cf0b2ecd90ca",
      "probe": {
        ...
      },
      "data": {
        "message": "Log \"/var/log/zookeeper/zookeeper.out\" matched /ERROR/.",
        "value": 1,
        "details": {
          "matches": [ {
            "match": "ERROR",
            "context": "ERROR: example error from"
          } ]
        }
      }
    } ]

Assuming we go and fix the actual problem, we can go close them (let's pretend
there were several alarms for nameservice), and then we'll validate it actually
closed:

    amonadm close -r nameservice
    amonadm alarms
    ID   ROLE               MACHINE  PROBE


EXAMPLE: Adding probes to a newly deployed zone
-----------------------------------------------

Let's suppose we just deployed a new nameservice zone `65196484`, so we'll go
ahead and add probes to it:

    amonadm add -r nameservice -m 65196484
    added 7 probes
    amonadm probes -r nameservice
    ROLE               MACHINE  PROBE    NAME
    nameservice        12b82cd  23f439e  ZK: ruok
    nameservice        12b82cd  2c248d4  svcs: SMF maintenance
    nameservice        12b82cd  48e935b  free space on / below 20%
    nameservice        12b82cd  856c306  binder: logscan
    nameservice        12b82cd  d7489f5  ZK: logscan 'Connection refused'
    nameservice        12b82cd  ee38f4a  ZK: logscan 'ERROR'
    nameservice        12b82cd  ffc215d  mbackup: logs not uploaded
    nameservice        6519648  2f88b35  svcs: SMF maintenance
    nameservice        6519648  5aa69e8  binder: logscan
    nameservice        6519648  734b66e  free space on / below 20%
    nameservice        6519648  7ae261e  ZK: logscan 'ERROR'
    nameservice        6519648  8af3e9f  ZK: ruok
    nameservice        6519648  9b49474  mbackup: logs not uploaded
    nameservice        6519648  d9f99e6  ZK: logscan 'Connection refused'

So now we can see that we've got a new set of probes defined for the new system.

EXAMPLE: Updating probes for a service
-----------------------------------------------

If we added new probe files to the example nameservice role, we would update
this service probes so they get added to all nameservice machines:

    amonadm update -r nameservice
    Probe 23f439e is unchanged
    Probe 2c248d4 is unchanged
    Probe 48e935b is unchanged
    ...
    added 0 probes
    updated 3 probes
    dropped 0 probes


EXAMPLE: Deleting probes from an undeployed zone
------------------------------------------------

When a zone is undeployed, you'll want to be sure there are no lingering alarms
for it (which will show up as `UNKNOWN`):

    amonadm drop -m 6519648
    dropped 7 probes


COMMON OPTIONS
--------------

The following options are supported in all commands:

`-f, --file config_file`
  Use the specified configuration file. The default value is
  /opt/smartdc/sdc/etc/amonadm.config.json. This can also be set in the
  environment using `AMONADM_CFG_FILE`.

`-h, --help`
  Print a help message and exit.

`-v, --verbose`
  Turn on debug logging.  This will be `bunyan` output, and will be on `stderr`.
  Use something like `amonadm alarms -v 2>&1 | bunyan` to view.

COMMANDS
--------

The following commands and options are supported:

### add [OPTIONS...]

Add probes to a machine, all machines in a role, or probes for all systems in a
datacenter.  THe default with no options is to go through and add probes per
role to all systems.

The following options are supported:

`--concurrency LIMIT`
  number of probes to add in parallel

`-m MACHINE_UUID, --machine UUID`
  machine to add probes for

`-r, --role ROLE`
  role to create probes for (all machines)

### add [OPTIONS...]

Updates all probes for a given role or machine. This is functionally equivalent
to drop-add, which means that: existing probes get updated if the have changed,
new probes are added and installed probes that are not defined in the probe
files anymore are dropped. The default is to update all probes for all roles.

The following options are supported:

`--concurrency LIMIT`
  number of probes to update in parallel

`-m MACHINE_UUID, --machine UUID`
  machine to update probes for

`-r, --role ROLE`
  role to update probes for (all machines)

### drop [OPTIONS...]

Drops probes from a machine, all machines in a role, or probes for all systems
in a datacenter.  The default with no options is to drop all probes.

The following options are supported:

`--concurrency LIMIT`
  number of probes to drop in parallel

`-m MACHINE_UUID, --machine UUID`
  machine to add probes for

`-r, --role ROLE`
  role to create probes for (all machines)

### probes [OPTIONS...]

Lists probes for a machine, all machines in a role, or all probes in a
datacenter.  The default is to list all probes.

The following options are supported:

`-H`
  do not emit header line

`-m MACHINE_UUID, --machine UUID`
  machine to add probes for

`-r, --role ROLE`
  role to create probes for (all machines)

### probe [OPTIONS...] PROBE...

Gets probe(s) details (xargs friendly).  Raw JSON for probes is returned.

### alarms [OPTIONS...]

Lists alarms for a machine, all machines in a role, or all alarms in a
datacenter.  The default is to list all alarms.

The following options are supported:

`--concurrency LIMIT`
  number of requests to make in parallel

`-H`
  do not emit header line

`-m MACHINE_UUID, --machine UUID`
  machine to add probes for

`-r, --role ROLE`
  role to create probes for (all machines)

### alarm [OPTIONS...] ID...

Gets alarm(s) details (xargs friendly).  Raw JSON is returned.

The following options are supported:

`--concurrency LIMIT`
  number of requests to make in parallel


### close [OPTIONS...] ID...

Closes alarms for a machine, all machines in a role, or all alarms in a
datacenter.  The default is to close all alarms.

The following options are supported:

`--concurrency LIMIT`
  number of requests to make in parallel

`-m MACHINE_UUID, --machine UUID`
  machine to add probes for

`-r, --role ROLE`
  role to create probes for (all machines)

ENVIRONMENT
-----------

`AMONADM_CFG_FILE`
  In place of `-f, --file`

DIAGNOSTICS
-----------

When using the `-v` option, diagnostics will be sent to stderr in bunyan
output format.  As an example of tracing all information about a request,
try:

    $ amonadm alarms -v 2>&1 | bunyan

BUGS
----

Report bugs at [DevHub (MON)](https://devhub.joyent.com/jira/browse/MON)
