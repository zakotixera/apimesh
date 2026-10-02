# Postman artifacts

Import the [collection](endpoints.postman_collection.json) and [replay environment](replay.postman_environment.json).

Use `apicReplay=true` for local recordings; use a separate environment with `apicReplay=false` and your own values for live requests. [Setup](../docs/usage.md).

Regenerate with `apic render --postman`.

Requests are grouped into host folders, then endpoint folders, then individual recordings. Each recording retains its actual origin variable for live requests.
