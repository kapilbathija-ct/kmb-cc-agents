// This app registers no commercetools resources (no API Extension, no
// Subscription) - it's a plain inbound webhook the Merchant Center custom
// app/view's backend calls. Nothing to clean up on undeploy.
process.stdout.write('csr-agent: no resources to clean up.\n');
