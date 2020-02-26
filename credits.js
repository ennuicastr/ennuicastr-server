/*
 * Copyright (c) 2020 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

/* Functions relating to credits, converting credits back and forth to money,
 * and charging/crediting accounts */

const config = require("./config.js");
const cost = config.creditCost;
const db = require("./db.js").db;

/**
 * Convert number of credits to their purchase price in US cents
 */
function creditsToCents(credits) {
    return Math.round(credits * cost.currency / cost.credits);
}

/**
 * Returns a JavaScript string which converts an expression v in credits to
 * cents. We use ceil here instead of round, because they'll ultimately need to
 * pay a full cent purchase price.
 */
function creditsToCentsClient(v) {
    return "(Math.ceil((" + v + ") * " + cost.currency + " / " + cost.credits + "))";
}

/**
 * Convert number of credits to their purchase price in US dollars, as a string
 */
function creditsToDollars(credits) {
    var cents = creditsToCents(credits)+"";
    if (cents.length < 2)
        cents = "0" + cents;
    if (cents.length <= 2)
        return "0." + cents;
    return cents.slice(0, cents.length-2) + "." + cents.slice(cents.length-2);
}

/**
 * Convert a number of cents to the number of credits it buys, rounding up
 */
function centsToCredits(cents) {
    /* Be generous (ceil) when they're buying, though this ought to always be
     * an integer anyway */
    return Math.ceil(cents * cost.credits / cost.currency);
}

/**
 * Returns a JavaScript string which converts an expression v in cents to
 * credits.
 */
function centsToCreditsClient(v) {
    return "(Math.ceil((" + v + ") * " + cost.credits + " / " + cost.currency + "))";
}

/**
 * Converts a number of credits to the number of hours and minutes of recording
 * at regular quality that it buys.
 */
function creditsToHM(credits) {
    var baseCost = config.recCost.basic.upton;
    if (baseCost === 0) return "unlimited";
    var minutes = Math.floor(credits / baseCost);
    var hours = Math.floor(minutes / 60);
    minutes = (minutes % 60) + "";
    if (minutes.length < 2) minutes = "0" + minutes;
    return hours + ":" + minutes;
}

/**
 * Credits info for this user
 */
async function accountCredits(uid) {
    var row = await db.getP("SELECT *, (datetime('now')>subscription_expiry) AS subscription_expired FROM credits WHERE uid=@UID;", {
        "@UID": uid
    });
    if (row) {
        if (row.subscription_expired)
            row.subscription = 0;
        return row;
    }
    return {
        credits: 0,
        purchased: 0,
        subscription: 0
    };
}

/**
 * Standard "you have n credits" message for clients
 */
function creditsMessage(credits) {
    return "You have $" + creditsToDollars(credits.credits) + " in credit (" + creditsToHM(credits.credits) + " recording time).";
}

module.exports = {
    creditsToCents,
    creditsToDollars,
    centsToCredits,
    centsToCreditsClient,
    creditsToHM,
    accountCredits,
    creditsMessage
};
