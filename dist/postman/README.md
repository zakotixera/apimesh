# Postman artifacts

Import [the collection](endpoints.postman_collection.json) and [local replay environment](replay.postman_environment.json), then select the environment in Postman.

From the repository root, start the server:

```sh
cd workflow/cli
npm ci
npm run build
npm run apic -- serve
```

Leave the server running while sending requests; Ctrl+C stops it. It listens on `http://127.0.0.1:4010`. If the port is busy, run `npm run apic -- serve --port 4011` and change the environment's `baseUrl` to `http://127.0.0.1:4011`.

`apicReplay=true` routes each request locally and selects the correct recording. Keep masked placeholders unchanged; their environment entries are deliberately disabled for replay. `apic test` runs all recordings on its own temporary server and exits.

For live requests, use a separate environment with `apicReplay` absent or false. Each request retains its recorded origin through a separate collection variable. Supply your own placeholder values in the live environment. See the [generated setup and placeholder guide](../docs/usage.md).

Edit canonical inputs or renderer code and regenerate; the CLI owns these artifacts.
