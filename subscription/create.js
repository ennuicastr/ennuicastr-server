#!/usr/bin/env node
const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const authorization = "Basic " + Buffer.from(config.paypal.clientId + ":" + config.paypal.secret).toString("base64");

(async function() {
    // Make the product
    var subscription = {
        name: "Ennuicastr subscription",
        description: "Unlimited recordings with Ennuicastr",
        type: "SERVICE",
        category: "SOFTWARE",
        home_url: config.site
    };

    var product = await nrc.postPromise("https://" + config.paypal.api + "/v1/catalogs/products", {
        headers: {
            "content-type": "application/json",
            authorization
        },
        data: JSON.stringify(subscription)
    });
    product = product.data;

    console.log(JSON.stringify(product));

    // Then make the two plans
    var plan = {
        product_id: product.id,
        name: "Ennuicastr basic subscription",
        description: "Unlimited recordings with 128kbit Opus",
        billing_cycles: [
            {
                frequency: {
                    interval_unit: "MONTH",
                    interval_count: 1
                },
                tenure_type: "REGULAR",
                sequence: 1,
                pricing_scheme: {
                    fixed_price: {
                        value: (config.subscription.basic/100).toString(),
                        currency_code: "USD"
                    }
                }
            }
        ],
        payment_preferences: {}
    };

    var basicPlan = await nrc.postPromise("https://" + config.paypal.api + "/v1/billing/plans", {
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization,
            prefer: "return=representation"
        },
        data: JSON.stringify(plan)
    });
    basicPlan = basicPlan.data;

    console.log(JSON.stringify(basicPlan));

    plan.name = "Ennuicastr HQ subscription";
    plan.description = "Unlimited recordings with lossless FLAC";
    plan.billing_cycles[0].pricing_scheme.fixed_price.value =
        (config.subscription.hq/100).toString();

    var hqPlan = await nrc.postPromise("https://" + config.paypal.api + "/v1/billing/plans", {
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization,
            prefer: "return=representation"
        },
        data: JSON.stringify(plan)
    });
    hqPlan = hqPlan.data;

    console.log(JSON.stringify(hqPlan));

    plan.name += " (upgrade from basic)";
    plan.billing_cycles = [
        {
            frequency: {
                interval_unit: "MONTH",
                interval_count: 1
            },
            tenure_type: "TRIAL",
            sequence: 1,
            total_cycles: 1,
            pricing_scheme: {
                fixed_price: {
                    value: ((config.subscription.hq-config.subscription.basic)/100).toString(),
                    currency_code: "USD"
                }
            }
        },
        plan.billing_cycles[0]
    ];
    plan.billing_cycles[1].sequence = 2;

    var hqBasicUpgradePlan = await nrc.postPromise("https://" + config.paypal.api + "/v1/billing/plans", {
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization,
            prefer: "return=representation"
        },
        data: JSON.stringify(plan)
    });
    hqBasicUpgradePlan = hqBasicUpgradePlan.data;

    console.log(JSON.stringify({
        product,
        basic: basicPlan,
        hq: hqPlan,
        hqBasicUpgrade: hqBasicUpgradePlan
    }));
})();
