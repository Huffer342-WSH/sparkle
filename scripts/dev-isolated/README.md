# Isolated development

Run `pnpm dev:isolated` from the repository root on Windows, after installing
the project's dependencies and resources with `pnpm install`. The workspace path
must not contain spaces. The ordinary `pnpm dev` command is unchanged.

By default, the launcher builds the local mihomo checkout at `ref/mihomo` using
Go and the `with_gvisor` build tag. The executable is written to
`out/dev/bin/mihomo.exe`; it does not replace the bundled core in `extra/sidecar`
or write build output into the mihomo checkout. Source code and binaries are
not included in this commit.

To select a different source checkout or an existing executable:

```sh
pnpm dev:isolated --core-source E:/Projects/Network/mihomo
pnpm dev:isolated --core-path E:/Tools/mihomo.exe
```

`--core-path` skips compilation. `--skip-build` reuses `out/dev/bin/mihomo.exe`.
Close the previous development instance before rebuilding its core.

Vite provides renderer hot updates and main/preload rebuilds. Application data
and logs persist in `out/dev/data` and `out/dev/data/logs`. The launcher uses a
separate application identity, controller pipe and hook directory. System proxy
operations are disabled; the initial configuration disables TUN and DNS listeners
and selects an available local mixed port. Enabling TUN manually can still affect
system networking.

The initial profile is `profiles/small.yaml`. `profiles/geodata.yaml` is also
available in the subscription UI for manual switching. It contains 37 GeoSite
categories (including attribute filters), 10 GeoIP categories, six DIRECT-only
selector groups, and domain, IPv4/IPv6 and logical combination rules (62 rules
in total). It has no proxy credentials, external rule providers or MRS dependencies.
The fixture follows the [mihomo routing rules documentation](https://wiki.metacubex.one/config/rules/).
GeoData
files are copied from `extra/files` on first use. Use `--cache-dir` to select
another resource directory and `--config` to seed a different large profile.

Existing development profiles and settings are preserved. Changes to the seed
files or `--config` do not overwrite an existing profile; import the updated YAML
through the UI to test it. The launcher never switches profiles automatically.

The build-time `__SPARKLE_ISOLATED__` flag enables isolation only for this launcher
and dedicated test builds. Ordinary builds remove the isolation initialization.

The larger fixture exercises configuration parsing and GeoData matcher construction.
It is not a routing correctness test or a stable performance benchmark. Category
availability depends on the database; it was validated with the MetaCubeX data
used by this project. Custom databases may not contain every category.
