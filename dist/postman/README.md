# Postman artifacts

A generated Postman collection and environment for inspecting requests and testing recorded behavior.

Import [the collection](bilibili-collection.postman_collection.json) and [environment](bilibili-collection.postman_environment.json) into Postman. The environment points to `http://127.0.0.1:4010`; importing it does not start a server.

Use `apic test` for managed local replay: it starts a temporary server, runs Newman, and shuts the server down. The CLI owns the generated files; see its [usage guide](../../workflows/cli/README.md).
