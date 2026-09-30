# Postman artifacts

A generated Postman collection and environment for inspecting requests and testing recorded behavior.

Import [the collection](endpoints.postman_collection.json) and [environment](replay.postman_environment.json) into Postman. The environment points to `http://127.0.0.1:4010`; importing it does not start a server.

Use `apic test` for managed local replay: it starts a temporary server, runs Newman, and shuts the server down. The CLI owns the generated files.
