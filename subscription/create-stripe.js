#!/usr/bin/env node
const nrc = new (require("node-rest-client-promise")).Client();

const config = require("../config.js");
const authorization = "Basic " + Buffer.from(config.stripe.secret).toString("base64");

(async function() {
    // Make the basic product
    let basicSubscriptionDesc = {
        name: "Ennuicastr basic subscription",
        description: "Unlimited recordings with Ennuicastr with 128kbit Opus",
        url: config.site
    };

    let basicProduct = await nrc.postPromise("https://api.stripe.com/v1/products", {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            authorization
        },
        data: basicSubscriptionDesc
    });
    basicProduct = basicProduct.data;

    // Make the HQ product
    let hqSubscriptionDesc = Object.assign({}, basicSubscriptionDesc);
    hqSubscriptionDesc.name = "Ennuicastr HQ subscription";
    hqSubscriptionDesc.description = "Unlimited recordings with Ennuicastr with lossless FLAC";

    let hqProduct = await nrc.postPromise("https://api.stripe.com/v1/products", {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            authorization
        },
        data: hqSubscriptionDesc
    });
    hqProduct = hqProduct.data;

    // Now make the basic price
    let basicPriceDesc = {
        currency: "usd",
        product: basicProduct.id,
        unit_amount: config.subscription.basic,
        "recurring[interval]": "month"
    };

    let basicPrice = await nrc.postPromise("https://api.stripe.com/v1/prices", {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            authorization
        },
        data: basicPriceDesc
    });
    basicPrice = basicPrice.data;

    // And the HQ price
    let hqPriceDesc = Object.assign({}, basicPriceDesc);
    hqPriceDesc.product = hqProduct.id;
    hqPriceDesc.unit_amount = config.subscription.hq;

    let hqPrice = await nrc.postPromise("https://api.stripe.com/v1/prices", {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            authorization
        },
        data: hqPriceDesc
    });
    hqPrice = hqPrice.data;

    // We need a "coupon" for upgrading to HQ from basic
    let hqCouponDesc = {
        amount_off: config.subscription.basic,
        currency: "usd",
        duration: "once",
        name: "Upgrade from basic discount",
        "applies_to[products][0]": hqProduct.id
    };

    let hqCoupon = await nrc.postPromise("https://api.stripe.com/v1/coupons", {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            authorization
        },
        data: hqCouponDesc
    });
    hqCoupon = hqCoupon.data;

    console.log(JSON.stringify({
        basicProduct,
        hqProduct,
        basic: basicPrice,
        hq: hqPrice,
        hqBasicUpgrade: hqCoupon
    }));
})();
