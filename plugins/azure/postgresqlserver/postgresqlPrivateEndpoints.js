var async = require('async');
const helpers = require('../../../helpers/azure');

module.exports = {
    title: 'PostgreSQL Server Private Endpoints Configured',
    category: 'PostgreSQL Server',
    domain: 'Databases',
    description: 'Ensures that PostgreSQL Servers are accessible only through private endpoints',
    more_info: 'Azure Private Endpoint is a network interface that connects you privately and securely to a service powered by Azure Private Link. Private Endpoint uses a private IP address from your VNet, effectively bringing the service such as Azure SQL Server into your VNet.',
    recommended_action: 'Ensure that Private Endpoints are configured properly and Public Network Access is disabled for PostgreSQL Server',
    link: 'https://learn.microsoft.com/en-us/azure/private-link/private-link-overview',
    apis: ['servers:listPostgres'],
    realtime_triggers: ['microsoftdbforpostgresql:servers:write','microsoftdbforpostgresql:servers:delete'],

    run: function(cache, settings, callback) {
        var results = [];
        var source = {};
        var locations = helpers.locations(settings.govcloud);

        async.each(locations.servers, function(location, rcb) {

            var servers = helpers.addSource(cache, source,
                ['servers', 'listPostgres', location]);

            if (!servers) return rcb();

            if (servers.err || !servers.data) {
                helpers.addResult(results, 3,
                    'Unable to query for PostgreSQL servers: ' + helpers.addError(servers), location);
                return rcb();
            }

            if (!servers.data.length) {
                helpers.addResult(results, 0, 'No PostgreSQL servers found', location);
                return rcb();
            }

            for (const server of servers.data) {
                if (server.privateEndpointConnections && server.privateEndpointConnections.length) {
                    helpers.addResult(results, 0, 'Private Endpoints are configured for the PostgreSQL Server', location, server.id);
                } else {
                    helpers.addResult(results, 2, 'Private Endpoints are not configured for the PostgreSQL Server', location, server.id);
                }
            }

            rcb();
        }, function() {
            callback(null, results, source);
        });
    }
};
