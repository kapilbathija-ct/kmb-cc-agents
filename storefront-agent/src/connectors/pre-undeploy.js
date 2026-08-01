// This app registers no commercetools resources (no API Extension, no
// Subscription) - it's a plain inbound webhook the storefront BFF calls.
// Nothing to clean up on undeploy.
process.stdout.write('storefront-agent: no resources to clean up.\n');
