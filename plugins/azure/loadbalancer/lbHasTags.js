const async = require('async');
const helpers = require('../../../helpers/azure');

module.exports = {
    title: 'Load Balancer Has Tags',
    category: 'Load Balancer',
    domain: 'Availability',
    description: 'Ensures that Azure Load Balancers have tags associated.',
    more_info: 'Tags help you to group resources together that are related to or associated with each other. It is a best practice to tag cloud resources to better organize and gain visibility into their usage.',
    link: 'https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/tag-resources',
    recommended_action: 'Modify affected load balancers and add tags.',
    apis: ['loadBalancers:listAll'],
    realtime_triggers: ['microsoftnetwork:loadbalancers:write', 'microsoftnetwork:loadbalancers:delete', 'microsoftresources:tags:write'],

    run: function(cache, settings, callback) {
        const results = [];
        const source = {};
        const locations = helpers.locations(settings.govcloud);

        async.each(locations.loadBalancers, function(location, rcb) {

            const loadBalancers = helpers.addSource(cache, source,
                ['loadBalancers', 'listAll', location]);

            if (!loadBalancers) return rcb();

            if (loadBalancers.err || !loadBalancers.data) {
                helpers.addResult(results, 3,
                    'Unable to query Load Balancers: ' + helpers.addError(loadBalancers), location);
                return rcb();
            }

            if (!loadBalancers.data.length) {
                helpers.addResult(results, 0, 'No existing Load Balancers found', location);
                return rcb();
            }

            for (let lb of loadBalancers.data) {
                if (!lb.id) continue;

                if (lb.tags && Object.entries(lb.tags).length > 0){
                    helpers.addResult(results, 0, 'Load Balancer has tags associated', location, lb.id);
                } else {
                    helpers.addResult(results, 2, 'Load Balancer does not have tags associated', location, lb.id);
                } 
            }
            rcb();
        }, function() {
            callback(null, results, source);
        });
    }
};
