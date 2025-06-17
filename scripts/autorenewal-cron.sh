#!/bin/bash
# AutoRenewal Cron Script
# Generated automatically by SSL Certificate Manager

cd "/home/runner/workspace"
/usr/bin/node -e "
const autoRenewalService = require('./services/autoRenewalService');
const service = new autoRenewalService();
service.performRenewalCheck().then(result => {
  console.log('Cron renewal check completed:', result.message);
}).catch(error => {
  console.error('Cron renewal check failed:', error.message);
});
"
