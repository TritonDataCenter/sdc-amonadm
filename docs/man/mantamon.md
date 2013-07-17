mantamon 1 "July 2013" Manta "Manta Administrator Commands"
===========================================================

NAME
----

mantamon - manage Amon probes and alarms for a datacenter

SYNOPSIS
--------

`mantamon` [OPTION...] command [command-specific arguments]

DESCRIPTION
-----------

mantamon manages Amon probes and alarms for Manta services within a single
datacenter.  The most common operation(s) will be listing, viewing and closing
alarms, however probe management is typically done at deployment time.

A few notes on how mantamon sets up probes in Amon:

- Each "service" is a probe group.  This means that all alarms for a service
  even on different machines only results in one page.  It is expected that
  operators upon getting an alert/page investigate the state of the system fully
  with `mantamon alarms`.
- Probes are added for a machine/role by combining the role name with all the
  probes under `common`; the exception is `compute`, which is where marlin-agent
  probes are defined (GZ).
- mantamon is not idempotent; calling `add` twice on a role/machine will just
  double up all the probes. Use `drop` before `add` for the targeted system(s).


The commands that you'll use on "live" systems are mostly:

- probes/probe
- alarms/alarm
- close

And then there are "deployment" related commands:

- add
- drop

`add` puts new probes into the system by reading all the definitions in
`./probes`.  Note it doesn't try to do any reconciliation of existing
probes, so if you specify that you want to add for a role or machine (or
all), it's going to just append in everything it finds.  You almost certainly
will want to run `drop` first for the targeted system(s).

Before describing the detailed options for each command, some sample workflows
are given illustrating how to use mantamon.

EXAMPLE: Managing open alarms
-----------------------------

Here I inserted a sample "LogScan Error" alarm into a `nameservice` zone:

    mantamon alarms
    ID   ROLE               MACHINE  PROBE
    41   nameservice        12b82cd  ZK: logscan 'ERROR'

Above we see an abbreviated listing of alarms that have fired. We can view details
with:

    mantamon alarm 41
    Marks-MacBook-Pro:mantamon mcavage$ node main.js alarm 41
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

    mantamon close -r nameservice
    mantamon alarms
    ID   ROLE               MACHINE  PROBE


EXAMPLE: Adding probes to a newly deployed zone
-----------------------------------------------

Let's suppose we just deployed a new nameservice zone `65196484`, so we'll go
ahead and add probes to it:

    mantamon add -r nameservice -m 65196484
    added 7 probes
    mantamon probes -r nameservice
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

EXAMPLE: Deleting probes from an undeployed zone
------------------------------------------------

When a zone is undeployed, you'll want to be sure there are no lingering alarms
for it (which will show up as `UNKNOWN`):

    mantamon drop -m 6519648
    dropped 7 probes


COMMON OPTIONS
--------------

The following options are supported in all commands:

`-f, --file config_file`
  Use the specified configuration file, which matches what `manta-deployment`
  uses.  This can also be set in the environment using `MANTAMON_CFG_FILE`.
  Authenticate as account (login name).

`-h, --help`
  Print a help message and exit.

`-v, --verbose`
  Turn on debug logging.  This will be `bunyan` output, and will be on `stderr`.
  Use something like `mantamon alarms -v 2>&1 | bunyan` to view.

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

### drop [OPTIONS...]

Drops probes from a machine, all machines in a role, or probes for all systems
in a datacenter.  THe default with no options is to drop all probes.

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

`MANTAMON_CFG_FILE`
  In place of `-f, --file`

DIAGNOSTICS
-----------

When using the `-v` option, diagnostics will be sent to stderr in bunyan
output format.  As an example of tracing all information about a request,
try:

    $ mantamon alarms -v 2>&1 | bunyan

BUGS
----

Report bugs at [DevHub (MANTA)](https://devhub.joyent.com/jira/browse/MANTA)
