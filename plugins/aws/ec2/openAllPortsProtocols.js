var async = require('async');
var helpers = require('../../../helpers/aws');

module.exports = {
    title: 'Open All Ports Protocols',
    category: 'EC2',
    domain: 'Compute',
    description: 'Determine if security group has all ports or protocols open to the public',
    more_info: 'Security groups should be created on a per-service basis and avoid allowing all ports or protocols.',
    link: 'http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/authorizing-access-to-an-instance.html',
    recommended_action: 'Modify the security group to specify a specific port and protocol to allow.',
    apis: ['EC2:describeSecurityGroups', 'EC2:describeNetworkInterfaces', 'Lambda:listFunctions'],
    settings: {
        ec2_skip_unused_groups: {
            name: 'EC2 Skip Unused Groups',
            description: 'When set to true, skip checking ports for unused security groups and produce a WARN result',
            regex: '^(true|false)$',
            default: 'false',
        },
        check_network_interface: {
            name: 'Check Associated ENI',
            description: 'When set to true, checks elastic network interfaces associated to the security group and returns FAIL if both the security group and ENI are publicly exposed',
            regex: '^(true|false)$',
            default: 'false',
        }
    },
    compliance: {
        hipaa: 'HIPAA requires strict access controls to networks and services ' +
                'processing sensitive data. Security groups are the built-in ' +
                'method for restricting access to AWS services and should be ' +
                'configured to allow least-privilege access.',
        pci: 'PCI has explicit requirements around firewalled access to systems. ' +
             'Security groups should be properly secured to prevent access to ' +
             'backend services.'
    },
    realtime_triggers: ['ec2:CreateSecurityGroup','ec2:AuthorizeSecurityGroupIngress','ec2:ModifySecurityGroupRules', 'ec2:RevokeSecurityGroupIngress', 'ec2:DeleteSecurityGroup'],

    run: function(cache, settings, callback) {
        var config = {
            ec2_skip_unused_groups: settings.ec2_skip_unused_groups || this.settings.ec2_skip_unused_groups.default,
            check_network_interface: settings.check_network_interface || this.settings.check_network_interface.default,
        };

        config.ec2_skip_unused_groups = (config.ec2_skip_unused_groups == 'true');
        config.check_network_interface = (config.check_network_interface == 'true');

        var results = [];
        var source = {};
        var regions = helpers.regions(settings);
        var awsOrGov = helpers.defaultPartition(settings);

        async.each(regions.ec2, function(region, rcb){
            var describeSecurityGroups = helpers.addSource(cache, source,
                ['ec2', 'describeSecurityGroups', region]);

            if (!describeSecurityGroups) return rcb();

            if (describeSecurityGroups.err || !describeSecurityGroups.data) {
                helpers.addResult(results, 3,
                    'Unable to query for security groups: ' + helpers.addError(describeSecurityGroups), region);
                return rcb();
            }

            if (!describeSecurityGroups.data.length) {
                helpers.addResult(results, 0, 'No security groups present', region);
                return rcb();
            }

            var groups = describeSecurityGroups.data;
            if (config.ec2_skip_unused_groups) {
                var usedGroups = helpers.getUsedSecurityGroups(cache, results, region, rcb);
            }

            for (var g in groups) {
                var strings = [];
                var resource = `arn:${awsOrGov}:ec2:` + region + ':' +
                               groups[g].OwnerId + ':security-group/' +
                               groups[g].GroupId;

                for (var p in groups[g].IpPermissions) {
                    var permission = groups[g].IpPermissions[p];

                    for (var k in permission.IpRanges) {
                        var range = permission.IpRanges[k];

                        if (range.CidrIp === '0.0.0.0/0') {
                            if (!permission.FromPort && (!permission.ToPort || permission.ToPort === 65535)) {
                                var string = 'all ports open to 0.0.0.0/0';
                                if (strings.indexOf(string) === -1) strings.push(string);
                            }

                            if (permission.IpProtocol === '-1') {
                                var stringO = 'all protocols open to 0.0.0.0/0';
                                if (strings.indexOf(stringO) === -1) strings.push(stringO);
                            }
                        }
                    }

                    for (var l in permission.Ipv6Ranges) {
                        var rangeV6 = permission.Ipv6Ranges[l];

                        if (rangeV6.CidrIpv6 === '::/0') {
                            if (!permission.FromPort && (!permission.ToPort || permission.ToPort === 65535)) {
                                var stringV6 = 'all ports open to ::/0';
                                if (strings.indexOf(stringV6) === -1) strings.push(stringV6);
                            }

                            if (permission.IpProtocol === '-1') {
                                var stringP = 'all protocols open to ::/0';
                                if (strings.indexOf(stringP) === -1) strings.push(stringP);
                            }
                        }
                    }
                }

                if (strings.length) {
                    if (config.ec2_skip_unused_groups && groups[g].GroupId && usedGroups &&
                            usedGroups.length && !usedGroups.includes(groups[g].GroupId)) {
                        helpers.addResult(results, 1, `Security Group: ${groups[g].GroupId} is not in use`,
                            region, resource);
                    } else if ( config.check_network_interface) {
                        var resultString =  `Security group:${groups[g].GroupId} (${groups[g].GroupName}) has ${strings.join(' and ')}`;
                        helpers.checkNetworkInterface(groups[g].GroupId, groups[g].GroupName, resultString, region, results, resource, cache);
                    } else {
                        helpers.addResult(results, 2,
                            'Security group: ' + groups[g].GroupId +
                            ' (' + groups[g].GroupName +
                            ') has ' + strings.join(' and '), region,
                            resource);
                    }
                } else {
                    helpers.addResult(results, 0,
                        `Security group: ${groups[g].GroupId} (${groups[g].GroupName}) does not have all ports or protocols open to the public`,
                        region, resource);
                }
            }

            rcb();
        }, function(){
            callback(null, results, source);
        });
    }
};
